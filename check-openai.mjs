import dotenv from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'node:url';
import { classifyAIError } from './ai-retry.js';
dotenv.config({path:fileURLToPath(new URL('.env', import.meta.url)), quiet:true});
if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('ไม่พบ OPENAI_API_KEY ใน .env');
    process.exit(1);
}
try {
    const ai = new OpenAI({apiKey:process.env.OPENAI_API_KEY, timeout:30000, maxRetries:0});
    const response = await ai.responses.create({model:process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini', input:'ตอบเป็นภาษาไทยสั้น ๆ ว่า พร้อมใช้งาน', max_output_tokens:64, store:false});
    if (!response.output_text?.trim()) throw new Error('Empty response');
    console.log('OpenAI Responses API: PASS');
} catch (error) {
    console.error('OpenAI Responses API: FAIL', classifyAIError(error));
    process.exitCode = 1;
}
