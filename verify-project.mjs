import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import vm from 'node:vm';
import sharp from 'sharp';
import QRCode from 'qrcode';
import {crc16} from './slip-qr.js';

const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
// Block external fetch while testing real local OCR.
const preload = `globalThis.fetch = async () => { throw new Error("External network forbidden in OCR test"); };`;
const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'server.js'], {
    cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port), OPENAI_API_KEY: 'test-key', OPENAI_MODEL:'gpt-4.1-mini' }, stdio: ['ignore', 'pipe', 'pipe']
});
try {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
        child.stdout.on('data', () => { clearTimeout(timer); resolve(); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(base)).status, 200);
    const budget = body => fetch(`${base}/api/budget-plan`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    for (const amount of [0, -1, 'abc', 'Infinity', true, {}, []]) {
        assert.equal((await budget({amount, goal:'ออมเงิน'})).status, 400);
    }
    for (const goal of ['', '   ', {}, 10]) {
        assert.equal((await budget({amount:10000, goal})).status, 400);
    }
    assert.equal((await budget(null)).status, 400);
    for (const goal of ['💰 วางแผนเก็บเงิน', '🛍️ คำนวณงบซื้อของ', '📊 เช็กเงินพอใช้', 'วางแผนเก็บเงิน']) {
        for (const amount of [0.01, 0.29, 1.01, 10000.50]) {
            const response = await budget({amount, goal});
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.success, true);
            assert.equal(body.categories.reduce((sum, category) => sum + Math.round(category.amount * 100), 0), Math.round(amount * 100));
            assert.ok(body.aiResult.includes('คำแนะนำ'));
        }
    }
    const malformed = await fetch(`${base}/api/budget-plan`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{'});
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).success, false);
    assert.equal((await fetch(`${base}/api/split-slip`, {method:'POST'})).status, 400);
    async function slip(blob, field = 'slipImage') {
        const form = new FormData(); form.append(field, blob, 'slip.png');
        return fetch(`${base}/api/split-slip`, {method:'POST', body:form});
    }
    assert.equal((await slip(new Blob(['text'], {type:'text/plain'}))).status, 400);
    assert.equal((await slip(new Blob(['image'], {type:'image/png'}), 'wrongField')).status, 400);
    assert.equal((await slip(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {type:'image/png'}))).status, 413);
        assert.equal((await slip(new Blob(['broken image'], {type:'image/png'}))).status, 400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="700"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="52" fill="black"><text x="80" y="100">TRANSFER RECEIPT</text><text x="80" y="200">Amount: 1,240.00 THB</text><text x="80" y="300">Date: 23/09/2026</text><text x="80" y="400">Time: 18:42</text><text x="80" y="500">From: Alice Smith</text><text x="80" y="600">To: Bob Jones</text></g></svg>');
    const image = await sharp(svg).png().toBuffer();
    const ocrResponse = await slip(new Blob([image], {type:'image/png'}));
    assert.equal(ocrResponse.status, 200);
    const ocr = await ocrResponse.json();
    assert.equal(ocr.fields.amount, 1240);
    assert.equal(ocr.fields.time, '18:42');
    assert.equal(ocr.fields.date, '23/09/2026');
    assert.ok(ocr.fields.sender.includes('Alice'));
    assert.ok(ocr.fields.recipient.includes('Bob'));
    const blank = await sharp({create:{width:300,height:200,channels:3,background:'white'}}).png().toBuffer();
    const empty = await (await slip(new Blob([blank],{type:'image/png'}))).json();
    assert.equal(empty.success,true);
    assert.deepEqual(empty.fields,{});
    assert.equal(empty.needsManualAmount,true);
    // QR with a supported local amount: OCR need not understand the QR graphic.
    const payload='000201530376454071240.006304';
    const qrImage=await QRCode.toBuffer(payload+crc16(payload),{width:500,margin:4});
    const qrResponse=await slip(new Blob([qrImage],{type:'image/png'}));
    assert.equal(qrResponse.status,200);
    const qr=await qrResponse.json();
    assert.equal(qr.fields.amount,1240);
    assert.equal(qr.qrDetected,true);
    assert.equal(qr.needsManualAmount,false);
    // A bank verification URL must never be fetched; use printed text instead.
    const opaqueQR=await QRCode.toBuffer('https://bank.example/reference/123456789',{width:420,margin:4});
    const combined=await sharp(image).extend({right:480,background:'white'}).composite([{input:opaqueQR,left:1440,top:100}]).png().toBuffer();
    const fallback=await (await slip(new Blob([combined],{type:'image/png'}))).json();
    assert.equal(fallback.qrDetected,true);
    assert.equal(fallback.source,'ocr');
    assert.equal(fallback.fields.amount,1240);
    for (const goal of ['เก็บออม','ซื้อของชิ้นใหญ่','เช็กว่าพอใช้ไหม','อื่นๆ']) {
      for(const amount of [1000,50000]) {
        const response = await budget({amount,goal,customGoal:'เก็บเงินเรียนต่อ'});
        assert.equal(response.status,200);
        const plan=await response.json();
        assert.equal(plan.categories.reduce((sum,c)=>sum+Math.round(c.amount*100),0),amount*100);
        assert.equal(plan.categories.reduce((sum,c)=>sum+c.percent,0),100);
        assert.equal(plan.goal,goal==='อื่นๆ'?'เก็บเงินเรียนต่อ':goal);
      }
    }
    for(const customGoal of [undefined,'','   ']) assert.equal((await budget({amount:100,goal:'อื่นๆ',customGoal})).status,200);
    for(const customGoal of [{},'x'.repeat(201)]) assert.equal((await budget({amount:100,goal:'อื่นๆ',customGoal})).status,400);
    for(const goal of ['saving','big_purchase','enough','other']) {
        const response=await budget({amount:5000,goal});
        assert.equal(response.status,200);
        const body=await response.json();
        assert.equal(body.success,true);
        assert.equal(body.categories.reduce((sum,c)=>sum+Math.round(c.amount*100),0),500000);
    }
    const noGoal=await budget({amount:5000,goal:''});
    assert.equal(noGoal.status,400);
    assert.equal((await noGoal.json()).error,'กรุณาเลือกเป้าหมายทางการเงิน');
    assert.equal((await budget({amount:0.001, goal:'วางแผนเก็บเงิน'})).status, 400);
    console.log('PASS: server starts; local OCR, QR amount, opaque QR→OCR, blank/manual fallback, invalid uploads; all four budget goals unchanged.');
} finally { child.kill(); }
