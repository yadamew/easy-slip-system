import sharp from 'sharp';
import assert from 'node:assert/strict';
import {readSlip} from './slip-ocr.js';
const fixture=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="3000"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="64" fill="black"><text x="100" y="180">TRANSFER RECEIPT</text><text x="100" y="320">Transfer Amount: 1,250.00 THB</text><text x="100" y="460">Fee: 10.00 THB</text><text x="100" y="600">Balance: 99,000.00 THB</text></g></svg>');
const image=await sharp(fixture).png().toBuffer();
let sampled=process.memoryUsage().rss;const start=Date.now();
const timer=setInterval(()=>{sampled=Math.max(sampled,process.memoryUsage().rss);},25);
try {
 for(let i=0;i<2;i++){const result=await readSlip(image);assert.equal(result.fields.amount,1250);}
 // Exercise the two-pass path as well, at the maximum preprocessed dimensions.
 const blank=await sharp({create:{width:1600,height:2400,channels:3,background:'white'}}).png().toBuffer();
 const result=await readSlip(blank);assert.equal(result.fields.amount,undefined);assert.equal(result.ocrPasses,2);
 const peak=Math.max(sampled,process.resourceUsage().maxRSS*1024)/1024/1024;
 console.log(`OCR resource probe: peak RSS ${peak.toFixed(1)} MiB; elapsed ${((Date.now()-start)/1000).toFixed(1)} s; sequential requests, no Render CPU throttling.`);
 console.log(peak<400?'RAM probe has headroom below 512 MiB for these synthetic fixtures.':'Render Free RAM headroom not established; inspect actual workload before deploy.');
}finally{clearInterval(timer);}
