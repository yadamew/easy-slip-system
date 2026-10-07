import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlipText} from './slip-ocr.js';
import {parseSlipQR,crc16} from './slip-qr.js';
test('Thai fields and Thai digits',()=>{
    assert.deepEqual(parseSlipText('จำนวนเงิน ๑,๒๔๐.๐๐ บาท\nวันที่ 23 ก.ย. 2569\nเวลา 18:42\nชื่อผู้โอน: สมชาย ใจดี\nชื่อผู้รับ: สมหญิง ใจดี'),{amount:1240,date:'23 ก.ย. 2569',time:'18:42',sender:'สมชาย ใจดี',recipient:'สมหญิง ใจดี'});
});
test('partial fields do not fabricate names or amount',()=>{
    assert.deepEqual(parseSlipText('Date: 23/09/2026\nTime: 18:42\nReference: 123456789'),{date:'23/09/2026',time:'18:42'});
    assert.deepEqual(parseSlipText(''),{});
});
test('ambiguous unlabeled amounts require manual entry',()=>assert.equal(parseSlipText('120.00\n350.00').amount,undefined));
test('fee is excluded and split labels are supported',()=>assert.equal(parseSlipText('Fee 25.00\nAmount\n1,240.00 THB').amount,1240));
test('dot-separated dates and reference IDs are not monetary amounts',()=>assert.equal(parseSlipText('วันที่ 23.09.2569\nReference: 1234.56').amount,undefined));
test('amount label is preferred over unrelated trailing digits',()=>assert.equal(parseSlipText('Amount: 1,240.00 THB 18:42').amount,1240));
test('conflicting printed amounts require user entry',()=>assert.equal(parseSlipText('Amount: 1240.00\nTotal: 1500.00').amount,undefined));
test('QR accepts only CRC-valid THB amounts',()=>{
    const payload='000201530376454071240.006304';
    assert.deepEqual(parseSlipQR(payload+crc16(payload)),{amount:1240});
    assert.deepEqual(parseSlipQR(payload+'FFFF'),{});
    assert.deepEqual(parseSlipQR('https://bank.example/slip?amount=1240'),{});
    assert.deepEqual(parseSlipQR('0002010102116304ABCD'),{});
    const foreign='000201530384054071240.006304';
    assert.deepEqual(parseSlipQR(foreign+crc16(foreign)),{});
});
