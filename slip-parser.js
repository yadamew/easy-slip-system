const excludedMoney = /ค่าธรรมเนียม|ยอดคงเหลือ|เงินคงเหลือ|ยอดเงินคงเหลือ|ยอดรวมค่าธรรมเนียม|fee|balance|remaining|account|บัญชี|อ้างอิง|reference|ref\b|transaction\s*(?:id|no)|วันที่|date|เวลา|time/i;
const amountLabel = /(?:จำนวนเงิน(?:ที่โอน)?|ยอด(?:เงิน)?(?:โอน|ชำระ|จ่าย)|ยอดเงิน|จำนวนที่โอน|โอนเงิน|transfer\s*amount|payment\s*amount|paid\s*amount|amount|total)/i;
const numberToken = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
const valueLine = new RegExp('^(?:(?:฿|THB)\\s*)?('+numberToken+')(?:\\s*(?:บาท|THB|฿))?$', 'i');
const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const shortMonths = ['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
const englishMonths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function clean(text){return String(text).normalize('NFKC').replace(/[๐-๙]/g,d=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d))).replace(/\u200b|\ufeff/g,'').replace(/\u00a0/g,' ');}
export function parseSlipDate(input){
 const text=clean(input);let match,day,month,year,raw;
 if((match=text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/))){[,year,month,day]=match;raw=match[0];}
 else if((match=text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/))){[,day,month,year]=match;raw=match[0];}
 else{
  const names=[...months,...['ม\\.?\\s*ค\\.?','ก\\.?\\s*พ\\.?','มี\\.?\\s*ค\\.?','เม\\.?\\s*ย\\.?','พ\\.?\\s*ค\\.?','มิ\\.?\\s*ย\\.?','ก\\.?\\s*ค\\.?','ส\\.?\\s*ค\\.?','ก\\.?\\s*ย\\.?','ต\\.?\\s*ค\\.?','พ\\.?\\s*ย\\.?','ธ\\.?\\s*ค\\.?'],'Jan(?:uary)?','Feb(?:ruary)?','Mar(?:ch)?','Apr(?:il)?','May','Jun(?:e)?','Jul(?:y)?','Aug(?:ust)?','Sep(?:tember)?','Oct(?:ober)?','Nov(?:ember)?','Dec(?:ember)?'].join('|');
  match=text.match(new RegExp('(\\d{1,2})\\s*('+names+')\\s*,?\\s*(\\d{2,4})','i'));
  if(!match)return null;
  raw=match[0];day=match[1];year=match[3];const name=match[2].toLowerCase().replace(/[.\s]/g,'');month=months.indexOf(name)+1||shortMonths.indexOf(name)+1||englishMonths.indexOf(name.slice(0,3))+1;
 }
 day=Number(day);month=Number(month);year=Number(year);
 if(year<100)year+=year>=40?2500:2000; // Thai recent BE shorthand vs recent CE shorthand.
 if(year>=2400)year-=543;
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<1900||year>2200||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return {raw,iso:date.toISOString().slice(0,10)};
}
export function parseSlipText(rawText){
 const lines=clean(rawText).split(/\r?\n/).map(l=>l.trim().replace(/[ \t]+/g,' ')).filter(Boolean),fields={},labelled=[],currency=[];
 const numberAtStart=new RegExp('^(?:(?:฿|THB)\\s*)?('+numberToken+')(?![\\d.,])','i');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(excludedMoney.test(line))continue;
  const label=line.match(amountLabel);let value;
  if(label){const tail=line.slice(label.index+label[0].length).replace(/^\s*[:：-]?\s*/,'');value=tail.match(numberAtStart)?.[1];if(!tail)value=lines[i+1]?.match(valueLine)?.[1];}
  if(value){labelled.push(Number(value.replaceAll(',','')));continue;}
  const cur=line.match(new RegExp('(?:฿|THB)\\s*('+numberToken+')(?![\\d.,])','i'))||line.match(new RegExp('('+numberToken+')\\s*(?:บาท|THB|฿)(?=\\s|$)','i'));
  // A value following an excluded label belongs to that label, not the transfer.
  if(cur&&!excludedMoney.test(lines[i-1]||''))currency.push(Number(cur[1].replaceAll(',','')));
 }
 const amounts=labelled.length?labelled:currency;
 const valid=amounts.filter(n=>n>0&&Number.isFinite(n)&&Number.isSafeInteger(Math.round(n*100)));
 if(new Set(valid).size===1)fields.amount=valid[0];
 // Unlabelled decimals: only a unique standalone value, never dates/accounts/fees.
 if(!amounts.length){const decimals=lines.flatMap((line,i)=>!excludedMoney.test(line)&&!excludedMoney.test(lines[i-1]||'')&&/^\d[\d,]*\.\d{2}(?:\s*(?:บาท|THB))?$/.test(line)?[Number(line.match(/[\d,.]+/)[0].replaceAll(',',''))]:[]).filter(n=>n>0&&Number.isSafeInteger(Math.round(n*100)));if(new Set(decimals).size===1)fields.amount=decimals[0];}
 for(const line of lines){if(/อ้างอิง|reference|transaction\s*(?:id|no)|บัญชี|account/i.test(line))continue;const date=parseSlipDate(line);if(date){fields.date=date.raw;break;}}
 for(const line of lines){
  if(/อ้างอิง|reference|บัญชี|account/i.test(line))continue;
  const t=line.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?\b/i)||line.match(/(?:เวลา|time)\s*[:：]?\s*([01]?\d|2[0-3])[.]([0-5]\d)(?:[.]([0-5]\d))?/i);
  if(t){let hour=Number(t[1]);if(t[4]){if(hour<1||hour>12)continue;hour=hour%12+(/pm/i.test(t[4])?12:0);}fields.time=String(hour).padStart(2,'0')+':'+t[2]+(t[3]?':'+t[3]:'');break;}
 }
 const patterns={sender:/^(?:ชื่อผู้โอน|ผู้โอน(?:เงิน)?|ผู้ส่ง(?:เงิน)?|โอนจาก|จาก|sender(?:\s*name)?|from)\s*[:：-]?\s*(.*)$/i,recipient:/^(?:ชื่อผู้รับ|ผู้รับ(?:เงิน)?|โอนไปยัง|ไปยัง|ถึง|รับโดย|recipient(?:\s*name)?|receiver(?:\s*name)?|to)\s*[:：-]?\s*(.*)$/i};
 for(const [key,pattern] of Object.entries(patterns)){
  for(let i=0;i<lines.length;i++){const match=lines[i].match(pattern);if(!match)continue;const candidates=match[1]?[match[1]]:lines.slice(i+1,i+4);for(const name of candidates){if(/^(?:ธนาคาร|bank\b|กสิกร|ไทยพาณิชย์|กรุงไทย|กรุงศรี|ออมสิน|กรุงเทพ)/i.test(name))continue;if(!/[\p{L}]/u.test(name)||excludedMoney.test(name)||amountLabel.test(name)||Object.values(patterns).some(p=>p.test(name)))break;fields[key]=name;break;}break;}
 }
 for(let i=0;i<lines.length;i++){const match=lines[i].match(/(?:เลข(?:ที่)?(?:อ้างอิง|รายการ)|หมายเลข(?:อ้างอิง|รายการ|ธุรกรรม)|รหัส(?:อ้างอิง|รายการ)|reference(?:\s*(?:number|no\.?|id))?|ref\.?\s*(?:no\.?)?|transaction\s*(?:id|no\.?|number))\s*[:：#-]?\s*([A-Za-z0-9-]{5,})?/i);if(match){const ref=match[1]||lines[i+1]?.match(/^[A-Za-z0-9-]{5,}$/)?.[0];if(ref)fields.reference=ref;break;}}
 return fields;
}
