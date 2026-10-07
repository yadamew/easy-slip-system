import jsQR from 'jsqr';
import sharp from 'sharp';

export function crc16(value) {
    let crc = 0xffff;
    for (const byte of Buffer.from(value, 'utf8')) {
        crc ^= byte << 8;
        for (let bit=0; bit<8; bit++) crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Accept a THB amount only from a valid EMV payment payload, never a URL,
// transaction reference, account number, or arbitrary number in a QR code.
export function parseSlipQR(payload) {
    if (typeof payload !== 'string' || !payload.startsWith('000201') || !/6304[0-9A-F]{4}$/i.test(payload)) return {};
    if (crc16(payload.slice(0,-4)) !== payload.slice(-4).toUpperCase()) return {};
    const chars = Array.from(payload), tags = new Map();
    for (let offset=0; offset<chars.length;) {
        const header = chars.slice(offset,offset+4).join('');
        if (!/^\d{4}$/.test(header)) return {};
        const tag = header.slice(0,2), length = Number(header.slice(2));
        if (!length || offset+4+length>chars.length || tags.has(tag)) return {};
        tags.set(tag, chars.slice(offset+4,offset+4+length).join(''));
        offset += 4+length;
    }
    if (tags.get('53') !== '764') return {};
    const amount = tags.get('54');
    if (!amount || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) return {};
    const number = Number(amount);
    return number > 0 && Number.isSafeInteger(Math.round(number*100)) ? {amount:number} : {};
}

export async function readSlipQR(buffer) {
    const {data,info} = await sharp(buffer,{limitInputPixels:20000000}).rotate()
        .resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
        .flatten({background:'white'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const code = jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'attemptBoth'});
    return {detected:Boolean(code),fields:code ? parseSlipQR(code.data) : {}};
}
