import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createBudgetPlan } from './budget-plan.js';

// Exercise the actual page handlers without external API calls.
class Node {
  constructor() { this.children=[]; this.value=''; this.style={}; this.attrs={}; this.events={}; this.disabled=false; this.classes=new Set(); this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,yes)=>yes?this.classes.add(c):this.classes.delete(c)}; }
  append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
  replaceChildren(...nodes) {this.children=[];this.append(...nodes);}
  setAttribute(key,value) {this.attrs[key]=value;}
  addEventListener(key,handler) {this.events[key]=handler;}
  querySelector(selector) {return this.children.find(n=>n.className===selector.slice(1)) || this.children.map(n=>n.querySelector(selector)).find(Boolean);}
  remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  focus(){} select(){}
}
const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],Object.assign(new Node(),{id:m[1]})]));
const goals=[...html.matchAll(/data-goal="([^"]+)"/g)].map(match=>Object.assign(new Node(),{dataset:{goal:match[1]}}));
const storage=new Map();
let uploadResponse;
let confirmResult=true;
const context=vm.createContext({document:{getElementById:id=>nodes.get(id),createElement:()=>new Node(),querySelectorAll:selector=>selector==='.page'?[...nodes.values()].filter(n=>n.id.endsWith('Page')):goals},window:{scrollTo(){}},navigator:{clipboard:{async writeText(text){storage.set('clipboard',text);}}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout:()=>1,clearTimeout(){},AbortController,FormData,console,fetch:async(url,options)=>{if(url==='/api/split-slip')return uploadResponse;assert.equal(url,'/api/budget-plan');const input=JSON.parse(options.body);return{ok:true,json:async()=>({success:true,...createBudgetPlan(input.amount,input.goal,input.customGoal)})};}});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
context.confirm=()=>confirmResult;
const get=id=>nodes.get(id);
for(const [handler,page] of [['openSlipMode','slipPage'],['openBudgetMode','budgetPage'],['openHistory','historyPage']]) {
  vm.runInContext(handler+'()',context);
  assert.equal(get(page).classes.has('hidden'),false);
  assert.equal(get('homePage').classes.has('hidden'),true);
  vm.runInContext('goHome()',context);
  assert.equal(get('homePage').classes.has('hidden'),false);
  assert.equal(get(page).classes.has('hidden'),true);
}
get('manualSlip').onclick();get('slipAmount').value='1240.01';get('confirmSlip').onclick();
assert.equal(get('membersList').children.length,2);
get('addMember').onclick();
assert.equal(get('equalSplit').checked,true);
assert.equal(get('membersList').children.reduce((sum,row)=>sum+Math.round(Number(row.querySelector('.member-amount').value)*100),0),124001);
assert.ok(get('membersList').children.every(row=>row.querySelector('.member-amount').readOnly));
get('equalSplit').checked=false;get('equalSplit').onchange();
assert.ok(get('membersList').children.every(row=>!row.querySelector('.member-amount').readOnly));
get('membersList').children.forEach((row,index)=>row.querySelector('.member-name').value='คนที่ '+(index+1));
get('membersList').children[0].querySelector('.member-amount').value='310';
get('membersList').children[1].querySelector('.member-amount').value='400';
get('membersList').children[2].querySelector('.member-amount').value='530.01';
get('membersList').children[0].querySelector('.member-amount').oninput();
assert.equal(get('remainingTotal').textContent,'฿0.00');
get('calculateSplit').onclick();
assert.equal(get('splitRows').children.length,3);
assert.equal(vm.runInContext('split.reduce((sum,p)=>sum+p.cents,0)',context),124001);
assert.equal(get('paidCount').textContent,'จ่ายแล้ว 0 / 3 คน');
assert.equal(get('receivedTotal').textContent,'฿0.00');
get('splitRows').children[0].children.at(-1).onclick();
assert.equal(get('paidCount').textContent,'จ่ายแล้ว 1 / 3 คน');
assert.equal(get('receivedTotal').textContent,'฿310.00');
assert.equal(get('unpaidTotal').textContent,'฿930.01');
await get('copySplit').onclick();assert.ok(storage.get('clipboard').includes('คนที่ 1'));
assert.ok(storage.get('clipboard').includes('คนที่ 1: ฿310.00 - จ่ายแล้ว'));
assert.ok(storage.get('clipboard').includes('คนที่ 2: ฿400.00 - ยังไม่จ่าย'));
assert.ok(storage.get('clipboard').includes('เหลือรับเงิน ฿930.01'));
get('saveSplit').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,1);
assert.equal(JSON.parse(storage.get('easy-slip-history'))[0].people[0].isPaid,true);
get('splitRows').children[0].children.at(-1).onclick();
assert.equal(get('paidCount').textContent,'จ่ายแล้ว 0 / 3 คน');
assert.equal(JSON.parse(storage.get('easy-slip-history'))[0].people[0].isPaid,false);
get('saveSplit').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,1);
for(let i=0;i<3;i++)get('splitRows').children[i].children.at(-1).onclick();
assert.equal(get('receivedTotal').textContent,'฿1,240.01');
assert.equal(get('unpaidTotal').textContent,'฿0.00');
vm.runInContext('openHistory()',context);
assert.ok(get('historyList').children[0].querySelector('.history-metrics').children.some(n=>n.textContent==='จ่ายแล้ว 3/3'));
for (const goal of goals) {
  for(const amount of [1000,50000]) {
  goal.onclick();get('customGoal').value='เก็บเงินเรียนต่อ';get('budgetAmount').value=String(amount);await get('budgetForm').events.submit({preventDefault(){}});
  assert.equal(get('budgetBars').children.length,4);
  assert.equal(get('planGoal').textContent,'เป้าหมาย: '+createBudgetPlan(amount,goal.dataset.goal,'เก็บเงินเรียนต่อ').goal);
  assert.equal(get('planHighlight').textContent,amount===1000?'฿1,000.00':'฿50,000.00');
  assert.equal(get('budgetRemaining').textContent,'฿0.00');
  assert.equal(get('budgetTotal').textContent,get('budgetAllocated').textContent);
  assert.equal(get('allocationBar').children.length,4);
  assert.equal(get('allocationBar').children.reduce((sum,node)=>sum+parseFloat(node.style.flexBasis),0),100);
  assert.equal(get('budgetComplete').textContent,'✓ จัดสรรเงินครบแล้ว');
  }
}
get('customGoal').value=' ';await get('budgetForm').events.submit({preventDefault(){}});assert.ok(get('planGoal').textContent.includes('วางแผนงบประมาณทั่วไป'));
vm.runInContext("selectedGoal=''",context);await get('budgetForm').events.submit({preventDefault(){}});assert.equal(get('notice').textContent,'กรุณาเลือกเป้าหมายทางการเงิน');
goals[0].onclick();assert.equal(get('customGoal').disabled,true);
get('saveBudget').onclick();vm.runInContext('openHistory()',context);assert.equal(get('historyList').children.length,2);
const savedBudgetSnapshot=JSON.parse(storage.get('easy-slip-history')).find(entry=>entry.type==='แผนงบประมาณ');
assert.equal(savedBudgetSnapshot.amount,50000);
assert.equal(savedBudgetSnapshot.categories.reduce((sum,c)=>sum+c.amount,0),50000);
assert.equal(savedBudgetSnapshot.categories.reduce((sum,c)=>sum+c.percent,0),100);
assert.ok(savedBudgetSnapshot.date);
get('membersList').children[0].querySelector('.member-amount').value='2000';get('calculateSplit').onclick();assert.ok(get('notice').textContent.includes('เกินยอดรวม'));
assert.ok(get('splitWarning').textContent.includes('เกินยอดบิล'));
get('membersList').children[0].querySelector('.member-amount').value='0';get('membersList').children[0].querySelector('.member-amount').oninput();
assert.equal(get('remainingTotal').textContent,'฿310.00');
get('calculateSplit').onclick();assert.ok(get('notice').textContent.includes('ไม่ได้แบ่ง'));
get('equalSplit').checked=true;get('equalSplit').onchange();
get('membersList').children[0].children.at(-1).onclick();
assert.equal(get('membersList').children.reduce((sum,row)=>sum+Math.round(Number(row.querySelector('.member-amount').value)*100),0),124001);
assert.equal(get('remainingTotal').textContent,'฿0.00');
get('slipInput').files=[new Blob(['image'],{type:'image/png'})];
uploadResponse={ok:true,json:async()=>({success:true,aiResult:'จำนวนเงิน: 1240 บาท',fields:{amount:1240,date:'23/09/2026'},needsManualAmount:false})};
await get('uploadForm').events.submit({preventDefault(){}});
assert.equal(get('slipAmount').value,1240);
assert.equal(get('resultCard').classes.has('hidden'),false);
assert.equal(get('ocrFields').children[0].textContent,'วันที่: 23/09/2026');
get('confirmSlip').onclick();get('calculateSplit').onclick();
assert.equal(get('summaryPage').classes.has('hidden'),false);
assert.equal(get('paidCount').textContent,'จ่ายแล้ว 0 / 2 คน');
assert.equal(get('unpaidTotal').textContent,'฿1,240.00');
uploadResponse={ok:true,json:async()=>({success:true,aiResult:'เวลา: 18:42',fields:{time:'18:42'},needsManualAmount:true})};
await get('uploadForm').events.submit({preventDefault(){}});
assert.equal(get('slipAmount').value,'');
assert.ok(get('ocrFields').children.some(n=>n.textContent.includes('กรอกยอด')));
uploadResponse={ok:false,json:async()=>({success:false,error:'อ่านรูปไม่สำเร็จ'})};
await get('uploadForm').events.submit({preventDefault(){}});
assert.equal(get('resultCard').classes.has('hidden'),false);
assert.equal(get('slipButton').disabled,false);
get('slipAmount').value='250';get('confirmSlip').onclick();
assert.equal(get('membersPage').classes.has('hidden'),false);
assert.equal(get('membersTotal').textContent,'฿250.00');
// Existing structured bills and text-only legacy entries share the same storage.
const legacy={type:'สรุปผลการหาร',date:'2026-10-06T13:06:22.000Z',text:'สรุปผลการหาร\nยอดรวม ฿700.00\nหมิว: ฿350.00\nแม็ก: ฿350.00'};
const savedBudget=savedBudgetSnapshot;
storage.set('easy-slip-history',JSON.stringify([legacy,savedBudget]));
vm.runInContext('openHistory()',context);
assert.equal(get('historyList').children.length,2);
assert.equal(get('historyBillCount').textContent,'🧾 บิลที่หาร 1');
assert.ok(get('historyList').children[0].querySelector('.history-date').textContent.includes('6 ต.ค. 2569 • 20:06'));
const expand=get('historyList').children[0].querySelector('.secondary history-expand');
expand.onclick();assert.equal(expand.attrs['aria-expanded'],'true');expand.onclick();assert.equal(expand.attrs['aria-expanded'],'false');
get('historyList').children[0].querySelector('.history-paid').onclick();
assert.equal(JSON.parse(storage.get('easy-slip-history'))[0].people[0].isPaid,true);
assert.equal(JSON.parse(storage.get('easy-slip-history'))[0].date,legacy.date);
assert.ok(get('historyList').children[0].querySelector('.history-metrics').children.some(n=>n.textContent==='เหลือรับ ฿350.00'));
await get('historyList').children[0].querySelector('.secondary history-copy').onclick();
assert.ok(storage.get('clipboard').includes('หมิว: ฿350.00 - จ่ายแล้ว'));
get('historyBills').onclick();assert.equal(get('historyList').children.length,1);
get('historyBudgets').onclick();assert.equal(get('historyList').children.length,1);
assert.equal(get('historyList').children[0].querySelector('.pre history-original').textContent,savedBudget.text);
get('historyAll').onclick();
confirmResult=false;get('historyList').children[1].querySelector('.text history-delete').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,2);
confirmResult=true;get('historyList').children[1].querySelector('.text history-delete').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,1);
// New script context simulates reload: the paid state comes from persisted data.
storage.set('easy-slip-history',JSON.stringify([...JSON.parse(storage.get('easy-slip-history')),savedBudget]));
const reloaded=vm.createContext({document:context.document,window:context.window,navigator:context.navigator,localStorage:context.localStorage,setTimeout:context.setTimeout,clearTimeout:context.clearTimeout,AbortController,FormData,console,fetch:async()=>{throw new Error('History must not recalculate');},confirm:()=>confirmResult});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],reloaded);vm.runInContext('openHistory()',reloaded);
assert.equal(get('historyList').children.length,2);
assert.equal(JSON.parse(storage.get('easy-slip-history'))[1].amount,50000);
get('historyBudgets').onclick();
assert.equal(get('historyList').children[0].querySelector('.pre history-original').textContent,savedBudget.text);
get('historyAll').onclick();get('historyList').children[1].querySelector('.text history-delete').onclick();
assert.ok(get('historyList').children[0].querySelector('.history-metrics').children.some(n=>n.textContent==='จ่ายแล้ว 1/2'));
get('historyList').children[0].querySelector('.history-paid paid').onclick();
assert.equal(JSON.parse(storage.get('easy-slip-history'))[0].people[0].isPaid,false);
confirmResult=false;get('clearHistory').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,1);
confirmResult=true;get('clearHistory').onclick();assert.equal(JSON.parse(storage.get('easy-slip-history')).length,0);
assert.ok(get('historyList').children[0].querySelector('.secondary'));
console.log('PASS: existing slip/budget flows; history cards, legacy data, details, paid state/reload, clipboard, filters, delete and confirmed clear.');
