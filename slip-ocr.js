import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { readSlipQR } from './slip-qr.js';

import { parseSlipText, parseSlipDate } from './slip-parser.js';
export { parseSlipText } from './slip-parser.js';

let active = 0;
export async function readSlip(buffer) {
    if (active >= 2) throw Object.assign(new Error('ระบบกำลังอ่านสลิปอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่'), {status:503});
    active++;
    let worker, timer, expired = false;
    let qr = {detected:false,fields:{}};
    try {
        let image;
        try {
            const input=sharp(buffer,{limitInputPixels:20000000});
            const metadata=await input.metadata();
            const width=Math.min(2000,Math.max(1200,metadata.width||1200));
            let pipeline=input.rotate().flatten({background:'white'}).resize({width,height:3000,fit:'inside',withoutEnlargement:(metadata.width||width)>=1200}).grayscale();
            const stats=await sharp(await pipeline.clone().png().toBuffer()).stats();
            if(stats.channels[0].mean<100)pipeline=pipeline.negate();
            image=await pipeline.normalise().sharpen().png().toBuffer();
        }
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
            let {data} = await worker.recognize(image);
            let ocrFields = parseSlipText(data.text);
            let uncertain=false,passes=1;
            if(ocrFields.amount===undefined||data.confidence<65){
                await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
                const alternate=await worker.recognize(await sharp(image).threshold(165).png().toBuffer());
                passes++;
                const second=parseSlipText(alternate.data.text);
                uncertain=ocrFields.amount!==undefined&&second.amount!==undefined&&ocrFields.amount!==second.amount;
                ocrFields={...second,...ocrFields};
                if(uncertain)delete ocrFields.amount;
                if(alternate.data.confidence>data.confidence)data=alternate.data;
            }
            const conflict = qr.fields.amount !== undefined && ocrFields.amount !== undefined && qr.fields.amount !== ocrFields.amount;
            return {fields:{...ocrFields,...qr.fields},rawText:data.text,confidence:data.confidence,ocrPasses:passes,needsReview:true,verified:false,dateISO:ocrFields.date?parseSlipDate(ocrFields.date)?.iso:undefined,source:Object.keys(qr.fields).length?'qr+ocr':'ocr',qrDetected:qr.detected,
                ...(conflict?{warning:'ยอดจาก QR และข้อความไม่ตรงกัน กรุณาตรวจยอดจากสลิปจริงก่อนยืนยัน'}:uncertain?{warning:'OCR อ่านยอดแต่ละครั้งไม่ตรงกัน กรุณาตรวจและกรอกยอดด้วยตนเอง'}:data.confidence<65?{warning:'ข้อความอ่านได้ไม่ชัด กรุณาตรวจและแก้ยอดก่อนยืนยัน'}:{}),
                ...(qr.fields.amount !== undefined?{qrNotice:'ยอดจาก QR เป็นข้อมูลในรหัส ไม่ใช่การยืนยันว่าโอนเงินสำเร็จ กรุณาตรวจยอดกับสลิป'}:{})};
        })();
        try {
            return await Promise.race([task, new Promise((resolve,reject) => { timer=setTimeout(() => {expired=true;reject(Object.assign(new Error('OCR timeout'),{status:504}));},90000); })]);
        } catch {
            return {fields:qr.fields,rawText:'',confidence:0,source:Object.keys(qr.fields).length?'qr':'manual',qrDetected:qr.detected,warning:'อ่านข้อความไม่สำเร็จ กรุณาตรวจยอดที่พบหรือกรอกยอดเองเพื่อทำต่อ'};
        }
    } finally { clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); active--; }
}
