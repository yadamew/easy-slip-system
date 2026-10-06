import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// ตรวจสอบว่ามี API key ใน .env หรือไม่
if (!process.env.GEMINI_API_KEY) {
    console.error('ไม่พบ GEMINI_API_KEY ในไฟล์ .env');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// อ่าน API key จาก .env (ห้ามฝังในโค้ด)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/split-slip', upload.single('slipImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาอัปโหลดรูปสลิป' });
        }

        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString('base64'),
                mimeType: req.file.mimetype,
            },
        };

        const prompt =
            'วิเคราะห์สลิปนี้ ดึงข้อมูลยอดเงินรวม, ชื่อผู้รับ-ผู้โอน, วันที่, และเวลา ออกมาให้ชัดเจน';

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }, imagePart],
                },
            ],
        });

        res.json({
            success: true,
            aiResult: response.text,
        });
    } catch (error) {
        console.error('AI Error Details:', error);
        res.status(500).json({
            error: 'AI Error: ' + (error.message || JSON.stringify(error)),
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly at http://localhost:${PORT}`);
});