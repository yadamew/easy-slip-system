import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlipText,parseSlipDate} from './slip-parser.js';
// Synthetic OCR transcripts only, not genuine bank screenshots or certifications.
const fixtures=[
 ['K PLUS labelled legacy-like','K PLUS\nจำนวนเงิน 1,240.00 บาท\nค่าธรรมเนียม 0.00\n23 ก.ย. 2569\n18:42\nจาก: สมชาย ใจดี\nไปยัง: สมหญิง ใจดี\nเลขที่อ้างอิง K123456789'],
 ['K PLUS alternate labels (unverified new layout)','K PLUS\nยอดโอน\n1,240.00 THB\nยอดคงเหลือ\n98,000.00 THB\n2026-09-23\nเวลา 18.42\nผู้โอนเงิน: สมชาย ใจดี\nผู้รับเงิน: สมหญิง ใจดี\nรหัสอ้างอิง K123456789'],
 ['SCB labelled','SCB EASY\nTransfer Amount: THB 1,240.00\nFee: THB 10.00\n23 Sep 2026\n6:42 PM\nFrom: Alice Smith\nTo: Bob Jones\nReference No: SCB123456'],
 ['Krungthai labelled','Krungthai NEXT\nจำนวนเงินที่โอน\n1,240.00 บาท\nยอดเงินคงเหลือ 9000.00\n23/09/2569\n18:42\nชื่อผู้โอน: สมชาย\nชื่อผู้รับ: สมหญิง\nหมายเลขรายการ KTB123456'],
 ['Bangkok Bank labelled','Bangkok Bank\nAmount 1,240.00 THB\nBalance 98000.00 THB\n23-09-2026\n18:42\nSender: Alice\nRecipient: Bob\nTransaction ID BBL123456'],
 ['Krungsri labelled','Krungsri\nยอดชำระ 1,240.00 บาท\nค่าธรรมเนียม 10.00\n23 กันยายน 2569\n18:42\nโอนจาก: สมชาย\nโอนไปยัง: สมหญิง\nเลขอ้างอิง BAY123456'],
 ['GSB labelled','MyMo GSB\nยอดเงิน 1,240.00 บาท\nยอดคงเหลือ 8800.00\n23.09.2569\n18:42\nผู้ส่งเงิน: สมชาย\nรับโดย: สมหญิง\nหมายเลขอ้างอิง GSB123456'],
 ['TrueMoney labelled','TrueMoney Wallet\nจำนวนเงิน 1,240.00 บาท\nค่าธรรมเนียม\n15.00 บาท\n23 ก.ย. 69\n18:42\nผู้ส่ง: สมชาย\nผู้รับ: สมหญิง\nหมายเลขธุรกรรม TMN123456'],
 ['generic wallet labelled','Wallet\nPayment Amount: 1,240.00 THB\nRemaining balance 9900.00\n23/09/2026\n18:42\nSender Name: Alice\nReceiver Name: Bob\nReference: WAL123456'],
 ['ttb labelled','ttb touch\nTotal Paid 1 240.00 THB\nBalance 9800.00\n23/09/2026\n18:42\nFrom: Alice\nTo: Bob\nReference TTB123456'],
 ['BAAC labelled','BAAC Mobile\nยอดโอน 1,240.00 บาท\nค่าธรรมเนียม 5.00\n23 กันยายน 2569\nเวลา 18.42\nผู้โอน: สมชาย\nผู้รับ: สมหญิง\nเลขอ้างอิง BAAC123456']
];
for(const [name,text] of fixtures)test(`synthetic transcript: ${name}`,()=>{
 const result=parseSlipText(text);assert.equal(result.amount,1240);assert.equal(parseSlipDate(result.date)?.iso,'2026-09-23');assert.equal(result.time,'18:42');assert.ok(result.sender);assert.ok(result.recipient);assert.ok(result.reference);
});
test('fees, balances, references and account numbers never become transfer amount',()=>{
 for(const text of ['ค่าธรรมเนียม\n10.00 บาท','ยอดคงเหลือ\n9800.00 THB','Balance 9900.00','Reference 1234.56','บัญชี 1234.56'])assert.equal(parseSlipText(text).amount,undefined);
});
test('invalid dates rejected; BE and CE normalize to same date',()=>{
 assert.equal(parseSlipDate('31/02/2569'),null);
 for(const text of ['23/09/2026','23/09/2569','2026-09-23','23 กันยายน 2569','23 Sep 2026','23 ก.ย. 69','23/09/26'])assert.equal(parseSlipDate(text)?.iso,'2026-09-23');
});
