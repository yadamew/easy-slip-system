import {parseSlipText} from './slip-parser.js';
import {extractSlipAmount,MANUAL_AMOUNT_MESSAGE} from './slip-amount.js';
export function reconcileSlipReadings(readings,qr={fields:{}}){
 const fields={},candidates=[];
 for(const reading of [...readings].sort((a,b)=>b.confidence-a.confidence)){
  const parsed=parseSlipText(reading.text);for(const [key,value] of Object.entries(parsed))if(key!=='amount'&&fields[key]===undefined)fields[key]=value;
  const amount=extractSlipAmount(reading.text);
  if(amount.amount!==undefined&&(reading.confidence>=40||amount.score>=90&&reading.confidence>=30))candidates.push({amount:amount.amount,score:Math.round(amount.score*.7+reading.confidence*.3)});
 }
 candidates.sort((a,b)=>b.score-a.score);const best=candidates[0];
 const competing=candidates.find(c=>best&&c.amount!==best.amount);
 const ocrConflict=best&&competing&&best.score-competing.score<15;
 const qrAmount=qr.fields?.amount;
 const qrConflict=qrAmount!==undefined&&(ocrConflict||best&&best.amount!==qrAmount);
 if(!ocrConflict&&!qrConflict){if(qrAmount!==undefined)fields.amount=qrAmount;else if(best)fields.amount=best.amount;}
 return {fields,amountConfidence:fields.amount===undefined?0:qrAmount!==undefined?95:best.score,amountCandidates:candidates,needsReview:true,verified:false,
  ...(fields.amount===undefined?{warning:MANUAL_AMOUNT_MESSAGE}:fields.amount!==undefined&&qrAmount===undefined&&best.score<85?{warning:'ยอดเงินเป็นข้อเสนอจาก OCR กรุณาตรวจสอบและแก้ไขก่อนยืนยัน'}:{})};
}
