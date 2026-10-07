import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { getLanNetworks } from './lan-network.js';
import { readSlip } from './slip-ocr.js';
import { createBudgetPlan } from './budget-plan.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), {
    setHeaders(res, path) { if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); }
}));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter(req, file, callback) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            const error = new Error('กรุณาใช้รูป JPEG, PNG หรือ WebP');
            error.status = 400;
            return callback(error);
        }
        callback(null, true);
    }
});

app.post('/api/split-slip', upload.single('slipImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({success:false,error:'กรุณาอัปโหลดรูปสลิป'});
        const result = await readSlip(req.file.buffer);
            const labels = { amount:'จำนวนเงิน', date:'วันที่', time:'เวลา', sender:'ชื่อผู้โอน', recipient:'ชื่อผู้รับ' };
            const details = Object.entries(result.fields).map(([key,value]) => labels[key] + ': ' + value + (key === 'amount' ? ' บาท' : '')).join('\n');
            res.json({success:true, ...result, aiResult:details || 'ไม่พบข้อมูลที่อ่านได้ กรุณากรอกยอดเอง', needsManualAmount:result.fields.amount === undefined});
        } catch (error) {
            console.error('Local OCR failed; status:', error.status || 500);
            res.status(error.status || 500).json({success:false, needsManualAmount:true, error:error.status ? error.message : 'อ่านสลิปไม่สำเร็จ กรุณาลองภาพที่ชัดขึ้นหรือกรอกยอดด้วยตนเอง'});
        }
});

app.post('/api/budget-plan', (req,res) => {
    try { const {amount,goal,customGoal}=req.body ?? {}; res.json({success:true,...createBudgetPlan(amount,goal,customGoal)}); }
    catch(error) { res.status(400).json({success:false,error:error.message}); }
});

app.use((error,req,res,next) => {
    if(res.headersSent) return next(error);
    const tooLarge=error.code==='LIMIT_FILE_SIZE'||error.type==='entity.too.large';
    const status=tooLarge?413:error instanceof multer.MulterError?400:error.status||500;
    res.status(status).json({success:false,error:tooLarge?'ไฟล์หรือข้อมูลมีขนาดใหญ่เกินไป (รูปไม่เกิน 10 MB)':error instanceof multer.MulterError?'ไฟล์อัปโหลดไม่ถูกต้อง กรุณาส่งรูปสลิปเพียงหนึ่งไฟล์':error.type==='entity.parse.failed'?'ข้อมูล JSON ไม่ถูกต้อง':status<500?error.message:'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์'});
});
const PORT=Number(process.env.PORT||3000);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535) throw new Error('PORT must be between 1 and 65535');
app.listen(PORT, '0.0.0.0', () => {
    console.log('Easy Slip Splitter is running');
    console.log(`\nComputer:\nhttp://localhost:${PORT}`);
    const networks = getLanNetworks(networkInterfaces());
    console.log('\n📱 Mobile / Same Wi-Fi — Recommended URL:');
    if (networks.length) {
        console.log(`http://${networks[0].address}:${PORT} (${networks[0].name})`);
        if (networks.length > 1) {
            console.log('\nOther network URLs:');
            networks.slice(1).forEach(entry => console.log(`http://${entry.address}:${PORT} (${entry.name})`));
        }
    } else console.log('ไม่พบ LAN IPv4 กรุณาเชื่อมต่อ Wi-Fi / Hotspot แล้วเริ่ม server ใหม่');
    if (!networks.length || networks[0].rank === 2) console.log('\nตรวจ IPv4 ของ Wi-Fi ด้วยคำสั่ง:\nC:\\Windows\\System32\\ipconfig.exe');
    console.log('\nKeep this terminal open while using the website.');
    console.log('หาก reconnect Wi-Fi / Hotspot ให้เริ่ม server ใหม่และใช้ URL ล่าสุด');
}).on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${PORT} is already in use`:'Server could not start');process.exitCode=1;});
