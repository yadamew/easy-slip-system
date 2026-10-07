import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { readSlipQR } from './slip-qr.js';

export function parseSlipText(rawText) {
    const text = rawText.replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const fields = {};
    const amountLines = lines.filter(line => /จำนวนเงิน|ยอดโอน|ยอดเงิน|amount|total|THB|บาท|฿/i.test(line) && !/ค่าธรรมเนียม|fee|บัญชี|account|อ้างอิง|reference/i.test(line));
    const detectedAmounts = [];
    for (const line of amountLines) {
        const index = lines.indexOf(line);
        const candidate = line.match(/(?:จำนวนเงิน|ยอดโอน(?:เงิน)?|ยอดเงิน|amount|total)\s*[:：]?\s*(?:฿|THB)?\s*([\d,]+(?:\.\d{1,2})?)(?![\d.])/i)?.[1]
            || line.match(/(?:฿|THB)\s*([\d,]+(?:\.\d{1,2})?)(?![\d.])/i)?.[1]
            || line.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)(?=\s|$)/i)?.[1]
            || (/^(?:จำนวนเงิน|ยอดโอน(?:เงิน)?|ยอดเงิน|amount|total)\s*[:：]?$/i.test(line) ? lines[index+1]?.match(/^(?:฿\s*)?([\d,]+(?:\.\d{2})?)(?:\s*(?:บาท|THB))?$/i)?.[1] : undefined);
        const value = Number(candidate?.replaceAll(',', ''));
        if (candidate && /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(candidate) && Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value*100))) detectedAmounts.push(value);
    }
    if (new Set(detectedAmounts).size === 1) fields.amount = detectedAmounts[0];
    if (fields.amount === undefined && detectedAmounts.length === 0) {
        const candidates = lines.filter(line => !/ค่าธรรมเนียม|fee|บัญชี|account|อ้างอิง|reference|วันที่|date|เวลา|time|\d{1,2}[/.:-]\d{1,2}[/.:-]\d{2,4}/i.test(line)).flatMap(line => line.match(/\b(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\b/g) || []).map(value => Number(value.replaceAll(',', ''))).filter(value => value > 0 && Number.isSafeInteger(Math.round(value*100)));
        if (new Set(candidates).size === 1) fields.amount = candidates[0];
    }
    const date = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/) || text.match(/\d{1,2}\s+(?:ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*\d{2,4}/);
    if (date) fields.date = date[0];
    const time = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/);
    if (time) fields.time = time[0];
    for (const [key, pattern] of [['sender', /^(?:ชื่อผู้โอน|ผู้โอน|จาก|sender|from)\s*[:：-]?\s*(.*)$/i], ['recipient', /^(?:ชื่อผู้รับ|ผู้รับ|ไปยัง|ถึง|recipient|receiver|to)\s*[:：-]?\s*(.*)$/i]]) {
        for (let i=0; i<lines.length; i++) {
            const match = lines[i].match(pattern);
            if (!match) continue;
            const name = match[1] || lines[i+1] || '';
            if (name && !/^[\d\s*xX-]+$/.test(name) && !/จำนวนเงิน|ยอดเงิน|บัญชี|account|วันที่|เวลา/i.test(name)) fields[key] = name;
            break;
        }
    }
    return fields;
}

let active = 0;
export async function readSlip(buffer) {
    if (active >= 2) throw Object.assign(new Error('ระบบกำลังอ่านสลิปอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่'), {status:503});
    active++;
    let worker, timer, expired = false;
    let qr = {detected:false,fields:{}};
    try {
        let image;
        try { image = await sharp(buffer, {limitInputPixels:20000000}).rotate().resize({width:1800,withoutEnlargement:true}).grayscale().normalise().png().toBuffer(); }
        catch { throw Object.assign(new Error('ไม่สามารถเปิดรูปนี้ได้ กรุณาใช้รูป JPEG, PNG หรือ WebP ที่ไม่เสียหาย'), {status:400}); }
        // Scan QR before OCR; never follow links or call a bank verification API.
        try { qr = await readSlipQR(buffer); } catch { /* OCR remains available. */ }
        const langPath = fileURLToPath(new URL('./ocr-data/', import.meta.url));
        try { await Promise.all(['tha','eng'].map(lang => access(`${langPath}/${lang}.traineddata`))); }
        catch { return {fields:qr.fields,rawText:'',confidence:0,source:Object.keys(qr.fields).length?'qr':'manual',qrDetected:qr.detected,warning:'OCR ยังไม่พร้อม กรุณาตรวจยอดหรือกรอกยอดด้วยตนเอง'}; }
        const task = (async () => {
            worker = await createWorker(['tha','eng'], 1, {langPath, gzip:false, cacheMethod:'none', errorHandler:() => {}});
            if (expired) { await worker.terminate(); throw new Error('OCR timeout'); }
            await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
            const {data} = await worker.recognize(image);
            const ocrFields = parseSlipText(data.text);
            const conflict = qr.fields.amount !== undefined && ocrFields.amount !== undefined && qr.fields.amount !== ocrFields.amount;
            return {fields:{...ocrFields,...qr.fields},rawText:data.text,confidence:data.confidence,source:Object.keys(qr.fields).length?'qr+ocr':'ocr',qrDetected:qr.detected,
                ...(conflict?{warning:'ยอดจาก QR และข้อความไม่ตรงกัน กรุณาตรวจยอดจากสลิปจริงก่อนยืนยัน'}:{}),
                ...(qr.fields.amount !== undefined?{qrNotice:'ยอดจาก QR เป็นข้อมูลในรหัส ไม่ใช่การยืนยันว่าโอนเงินสำเร็จ กรุณาตรวจยอดกับสลิป'}:{})};
        })();
        try {
            return await Promise.race([task, new Promise((resolve,reject) => { timer=setTimeout(() => {expired=true;reject(Object.assign(new Error('OCR timeout'),{status:504}));},90000); })]);
        } catch {
            return {fields:qr.fields,rawText:'',confidence:0,source:Object.keys(qr.fields).length?'qr':'manual',qrDetected:qr.detected,warning:'อ่านข้อความไม่สำเร็จ กรุณาตรวจยอดที่พบหรือกรอกยอดเองเพื่อทำต่อ'};
        }
    } finally { clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); active--; }
}
