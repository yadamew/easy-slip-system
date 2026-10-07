import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const folder = new URL('./ocr-data/', import.meta.url);
await mkdir(folder, { recursive: true });
for (const language of ['tha', 'eng']) {
    const target = new URL(`${language}.traineddata`, folder);
    try { await access(target); continue; } catch {}
    const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${language}.traineddata`, {signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Language download failed: ${language} (${response.status})`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`Installed local OCR language: ${language}`);
}
console.log('OCR language files ready:', fileURLToPath(folder));
