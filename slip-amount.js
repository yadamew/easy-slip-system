export const MANUAL_AMOUNT_MESSAGE='ไม่สามารถยืนยันยอดเงินอัตโนมัติ กรุณาตรวจสอบและกรอกยอดเงิน';
const positive='จำนวนเงินที่โอน|จำนวนเงิน|จำนวนที่โอน|ยอดเงินโอน|ยอดโอน|ยอดชำระ|ยอดจ่าย|ยอดเงิน|Transfer\\s+Amount|Payment\\s+Amount|Total\\s+Paid|Paid\\s+Amount|Amount|Total';
const negative='ค่าธรรมเนียม|ยอดเงินคงเหลือ|ยอดคงเหลือ|เงินคงเหลือ|ยอดรวมค่าธรรมเนียม|เบอร์โทร(?:ศัพท์)?|หมายเลขโทรศัพท์|เลขบัญชี|บัญชี|เลข(?:ที่)?อ้างอิง|หมายเลข(?:อ้างอิง|รายการ|ธุรกรรม)|รหัส(?:อ้างอิง|รายการ)|Reference(?:\\s+(?:Number|No\\.?|ID))?|Transaction\\s+(?:ID|No\\.?|Number)|Ref\\.?|Fee|Balance|Remaining|Account|Phone|Mobile|วันที่|Date|เวลา|Time';
const markerPattern=new RegExp(negative+'|'+positive,'gi');
const isNegative=new RegExp('^(?:'+negative+')$','i');
const labelOnly=new RegExp('^(?:'+negative+')\\s*[:：#-]?\\s*$','i');
const positiveOnly=new RegExp('^(?:'+positive+')\\s*[:：-]?\\s*$','i');
export function normalizeSlipText(text){
 let result=String(text).normalize('NFKC').replace(/\u0e4d\u0e32/g,'ำ').replace(/[๐-๙]/g,d=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d))).replace(/[\u200b\ufeff]/g,'').replace(/\u00a0/g,' ');
 for(const label of ['จำนวนเงินที่โอน','จำนวนเงิน','ยอดเงินคงเหลือ','ยอดคงเหลือ','ค่าธรรมเนียม','ยอดโอน','ยอดชำระ','ยอดเงิน'])result=result.replace(new RegExp(label.split('').join('[ \\t]*'),'g'),label);
 result=result.replace(/(\d)[ \t]*([,.])[ \t]*(?=\d)/g,'$1$2');
 return result.replace(/\b\d{1,3}(?:[ \t]+\d{3})+(?:\.\d{1,2})?\b/g,value=>value.replace(/[ \t]+/g,','));
}
function markers(line){return [...line.matchAll(new RegExp(markerPattern))].map(m=>({start:m.index,end:m.index+m[0].length,negative:isNegative.test(m[0])}));}
export function extractSlipAmount(text){
 const lines=normalizeSlipText(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean),candidates=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],contexts=markers(line);
  for(const match of line.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g)){
   const start=match.index,end=start+match[0].length,before=line.slice(0,start),after=line.slice(end);
   if(/[\dA-Za-z.,:/-]$/.test(before)||/^[\dA-Za-z.,:/-]/.test(after))continue;
   const value=Number(match[0].replaceAll(',',''));if(value<=0||!Number.isSafeInteger(Math.round(value*100)))continue;
   const owner=contexts.filter(c=>c.end<=start).at(-1);
   if(owner?.negative)continue;
   const currency=/(?:฿|THB)\s*$/i.test(before)||/^\s*(?:บาท|THB|฿)(?=\s|$)/i.test(after);
   const standalone=/^(?:฿\s*|THB\s*)?[\d,.]+(?:\s*(?:บาท|THB|฿))?$/i.test(line);
   let score=0,reason='';
   if(owner&&!owner.negative){score=/^total$/i.test(line.slice(owner.start,owner.end))?92:96;reason='label';}
   else if(standalone){
    if(positiveOnly.test(lines[i-1]||'')){score=94;reason='adjacent label';}
    else if(labelOnly.test(lines[i-1]||'')||labelOnly.test(lines[i+1]||''))continue;
    else if(positiveOnly.test(lines[i+1]||'')){score=94;reason='adjacent label';}
    else if(i>1&&positiveOnly.test(lines[i-2])&&!markers(lines[i-1]).length&&!/\d/.test(lines[i-1])){score=88;reason='near label';}
    else if(currency||/^(?:บาท|THB|฿)$/i.test(lines[i+1]||'')){score=82;reason='currency';}
    else if(/\.\d{2}$/.test(match[0])){score=72;reason='standalone decimal';}
   }else if(currency){score=80;reason='currency';}
   // Unlabelled long integers can be a phone/account/reference even beside THB.
   if(!reason.includes('label')&&!match[0].includes('.')&&match[0].replaceAll(',','').length>=9)continue;
   if(score)candidates.push({value,score,reason,line:i});
  }
 }
 const grouped=new Map();for(const candidate of candidates){const previous=grouped.get(candidate.value);if(!previous||candidate.score>previous.score)grouped.set(candidate.value,candidate);}
 const ranked=[...grouped.values()].sort((a,b)=>b.score-a.score);
 const best=ranked[0],ambiguous=ranked.length>1&&best.score-ranked[1].score<10;
 return {amount:best&&!ambiguous?best.value:undefined,score:best&&!ambiguous?best.score:0,ambiguous,candidates:ranked};
}
