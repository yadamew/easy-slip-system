import assert from 'node:assert/strict';
const base=process.argv[2] || 'http://localhost:3000';
for(const goal of ['saving','big_purchase','enough','other','']) {
 const body={amount:5000,goal};
 const response=await fetch(base+'/api/budget-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();
 assert.equal(response.status,goal?200:400);
 if(goal){assert.equal(result.success,true);assert.equal(result.categories.reduce((sum,c)=>sum+Math.round(c.amount*100),0),500000);}
 else assert.equal(result.error,'กรุณาเลือกเป้าหมายทางการเงิน');
 console.log(`PASS: ${goal || 'no goal'} → HTTP ${response.status}`);
}
console.log('PASS: five regression cases on the actual HTTP endpoint.');
