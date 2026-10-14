import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { readSlipQR } from './slip-qr.js';

import { parseSlipText, parseSlipDate } from './slip-parser.js';
import { reconcileSlipReadings } from './slip-result.js';
import { MANUAL_AMOUNT_MESSAGE } from './slip-amount.js';
export { parseSlipText } from './slip-parser.js';
// Bound native image cache and run a single bilingual OCR worker at a time.
sharp.cache({memory:16,files:0,items:32});

let active = 0;
export async function readSlip(buffer) {
    if (active >= 1) throw Object.assign(new Error('ระบบกำลังอ่านสลิปอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่'), {status:503});
    active++;
    let worker, timer, expired = false;
    let qr = {detected:false,fields:{}};
    try {
        let image, plainImage;
        try {
            const input=sharp(buffer,{limitInputPixels:20000000});
            const metadata=await input.metadata();
            const width=Math.min(1600,Math.max(1200,metadata.width||1200));
            let pipeline=input.rotate().flatten({background:'white'}).resize({width,height:2400,fit:'inside',withoutEnlargement:(metadata.width||width)>=1200}).grayscale();
            const stats=await sharp(await pipeline.clone().png().toBuffer()).stats();
            if(stats.channels[0].mean<100)pipeline=pipeline.negate();
            plainImage=await pipeline.clone().png().toBuffer();
            image=await pipeline.normalise().sharpen().png().toBuffer();
        }
        catch { throw Object.assign(new Error('ไม่สามารถเปิดรูปนี้ได้ กรุณาใช้รูป JPEG, PNG หรือ WebP ที่ไม่เสียหาย'), {status:400}); }
        // Scan QR before OCR; never follow links or call a bank verification API.
        try { qr = await readSlipQR(buffer); } catch { /* OCR remains available. */ }
        const langPath = fileURLToPath(new URL('./ocr-data/', import.meta.url));
        try { await Promise.all(['tha','eng'].map(lang => access(`${langPath}/${lang}.traineddata`))); }
        catch { console.warn('[slip-ocr] models_missing; languages=tha+eng; run npm run setup:ocr'); return {fields:qr.fields,rawText:'',confidence:0,needsReview:true,verified:false,source:Object.keys(qr.fields).length?'qr':'manual',qrDetected:qr.detected,warning:qr.fields.amount===undefined?MANUAL_AMOUNT_MESSAGE:'OCR ยังไม่พร้อม กรุณาตรวจยอดจาก QR ก่อนยืนยัน'}; }
        const task = (async () => {
            worker = await createWorker(['tha','eng'], 1, {langPath, gzip:false, cacheMethod:'none', errorHandler:() => {}});
            if (expired) { await worker.terminate(); throw new Error('OCR timeout'); }
            await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
            let {data} = await worker.recognize(image);
            const readings=[data];
            const ocrFields = parseSlipText(data.text);
            let passes=1;
            if(ocrFields.amount===undefined||data.confidence<65){
                try {
                    await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
                    passes++;
                    const alternate=await worker.recognize(await sharp(image).threshold(165).png().toBuffer());
                    readings.push(alternate.data);
                    if(alternate.data.confidence>data.confidence)data=alternate.data;
                    // Thresholding can erase Thai marks/thin digits. Retry sparse layout
                    // on grayscale only when neither existing pass found an amount.
                    if(ocrFields.amount===undefined&&parseSlipText(alternate.data.text).amount===undefined){
                        passes++;
                        const grayscale=await worker.recognize(plainImage);
                        readings.push(grayscale.data);
                        if(grayscale.data.confidence>data.confidence)data=grayscale.data;
                    }
                } catch { /* Preserve the first reading if the optional second pass fails. */ }
            }
            const result=reconcileSlipReadings(readings,qr);
            // Metadata only: never log text, amounts, names, references or image data.
            if(result.fields.amount===undefined)console.info('[slip-ocr] amount_missing',JSON.stringify({engine:'tesseract.js',languages:['tha','eng'],modelsReady:true,qrDetected:qr.detected,passes,readings:readings.map(reading=>({confidence:reading.confidence,hasAmount:parseSlipText(reading.text).amount!==undefined})),hasDate:Boolean(result.fields.date),hasTime:Boolean(result.fields.time)}));
            return {...result,rawText:data.text,confidence:data.confidence,ocrPasses:passes,dateISO:result.fields.date?parseSlipDate(result.fields.date)?.iso:undefined,source:Object.keys(qr.fields).length?'qr+ocr':'ocr',qrDetected:qr.detected,
                ...(qr.fields.amount !== undefined?{qrNotice:'ยอดจาก QR เป็นข้อมูลในรหัส ไม่ใช่การยืนยันว่าโอนเงินสำเร็จ กรุณาตรวจยอดกับสลิป'}:{})};
        })();
        try {
            return await Promise.race([task, new Promise((resolve,reject) => { timer=setTimeout(() => {expired=true;reject(Object.assign(new Error('OCR timeout'),{status:504}));},90000); })]);
        } catch {
            console.warn('[slip-ocr]',expired?'timeout':'engine_failed','languages=tha+eng');
            return {fields:qr.fields,rawText:'',confidence:0,needsReview:true,verified:false,source:Object.keys(qr.fields).length?'qr':'manual',qrDetected:qr.detected,warning:qr.fields.amount===undefined?MANUAL_AMOUNT_MESSAGE:'กรุณาตรวจยอดจาก QR ก่อนยืนยัน'};
        }
    } finally { clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); active--; }
}
