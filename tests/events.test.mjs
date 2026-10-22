import test from 'node:test';
import assert from 'node:assert/strict';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {validateEvent,validateEntry,eventPhase} from '../shared/lib/events.mjs';
const secret='local-test-only-event-admin-password';
function fixture(){
 let clock=Date.parse('2026-10-22T04:00:00Z');const records=new Map();
 const store={async get(k){return structuredClone(records.get(k)||null);},async setJSON(k,v){records.set(k,structuredClone(v));},async list({prefix='',limit=30,cursor=''}){const keys=[...records.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:null};}};
 const options={store,secret,now:()=>clock};let handle=createSponsorsHandler(options);
 async function call(action,body,params={},headers={},path='events'){
  const url='https://fixture.example/api/'+path+'?'+new URLSearchParams({action,...params});const r=await handle(new Request(url,{method:body?'POST':'GET',headers:{Origin:'https://fixture.example',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};
 }
 const event=()=>({title:'周末交流赛',organizer:'发起人甲',description:'测试规则\n1v1单败淘汰',format:'BO5',contact:'公开集合说明',opensAt:new Date(clock-60000).toISOString(),closesAt:new Date(clock+3600000).toISOString(),startsAt:new Date(clock+7200000).toISOString()});
 async function challenge(){const j=await call('challenge');clock+=2500;return j.data.challenge;}
 const ticket='a'.repeat(64);
 return {records,store,call,event,ticket,now:()=>clock,advance:n=>clock+=n,at:n=>clock=n,restart:()=>handle=createSponsorsHandler(options),challenge,
  async create(changes={}){return call('create',{...event(),ticket,challenge:await challenge(),...changes});},
  async auth(){const r=await call('login',{password:secret},{},{},'sponsors');assert.equal(r.status,200);return {Cookie:r.cookie};},
  async approve(id){const auth=await this.auth();const r=await call('review',{id,status:'approved'}, {},auth);assert.equal(r.status,200);return {auth,item:r.data.item};},
  async join(id,changes={}){return call('join',{id,name:'选手乙',platformId:'9007199254740993',contact:'仅报名组织者可见的联系信息',note:'测试备注',ticket:'b'.repeat(64),challenge:await challenge(),...changes});}
 };
}
test('event schedule validates creation fields, ordered registration windows and Beijing boundaries',()=>{
 const f=fixture(),e=f.event();assert.equal(validateEvent(e).description,'测试规则\n1v1单败淘汰');
 for(const x of [{title:''},{format:''},{description:''},{closesAt:e.opensAt},{opensAt:e.closesAt},{startsAt:e.opensAt},{opensAt:'2026-10-22T12:00'},{opensAt:'2026-02-31T00:00:00Z'}])assert.throws(()=>validateEvent({...e,...x}));
 assert.equal(eventPhase(e,Date.parse(e.opensAt)-1).key,'upcoming');assert.equal(eventPhase(e,Date.parse(e.opensAt)).canJoin,true);assert.equal(eventPhase(e,Date.parse(e.closesAt)).canJoin,false);assert.equal(eventPhase(e,Date.parse(e.startsAt)).key,'started');
 assert.equal(validateEntry({name:'甲',platformId:'9223372036854775807',contact:'测试联系方式'}).platformId,'9223372036854775807');
 assert.throws(()=>validateEntry({name:'甲',platformId:'0',contact:'x'}));assert.throws(()=>validateEntry({name:'甲',platformId:'1',contact:''}));
});
test('any visitor may apply but pending/rejected events are hidden and cannot accept registrations',async()=>{
 const f=fixture(),created=await f.create({status:'approved'});assert.equal(created.status,201);const id=created.data.id;
 assert.deepEqual((await f.call('list')).data.items,[]);assert.equal((await f.call('list',undefined,{id})).status,404);
 assert.equal((await f.join(id)).status,404);assert.equal((await f.call('queue')).status,401);assert.equal((await f.call('review',{id,status:'approved'})).status,401);
 const management=await f.call('manage',{id,ticket:f.ticket});assert.equal(management.status,200);assert.equal(management.data.item.status,'pending');assert.equal(management.data.item.registrations,0);
});
test('approved event accepts signup; only organizer and owner see participant contacts',async()=>{
 const f=fixture(),id=(await f.create()).data.id;const {auth}=await f.approve(id);const joined=await f.join(id);assert.equal(joined.status,201);
 const publicView=await f.call('list',undefined,{id});assert.equal(publicView.data.item.registrations,1);assert.equal(publicView.data.participants,undefined);assert.ok(!JSON.stringify(publicView.data).includes('仅报名组织者可见'));
 const management=await f.call('manage',{id,ticket:f.ticket});assert.equal(management.data.participants[0].platformId,'9007199254740993');assert.equal(management.data.participants[0].contact,'仅报名组织者可见的联系信息');assert.equal(management.data.item.registrations,1);
 assert.equal((await f.call('manage',{id,ticket:'c'.repeat(64)})).status,404);
 const owner=await f.call('queue',undefined,{id},auth);assert.equal(owner.data.participants.length,1);assert.equal(owner.data.participants[0].ticketHash,undefined);
 const receipt=await f.call('entry',{id,entryId:joined.data.entryId,ticket:'b'.repeat(64)});assert.equal(receipt.status,200);assert.equal(receipt.data.entry.ticketHash,undefined);
 assert.equal((await f.call('entry',{id,entryId:joined.data.entryId,ticket:'d'.repeat(64)})).status,404);
});
test('registration validates opening and deadline at the server, including exact boundary',async()=>{
 const f=fixture(),created=await f.create({opensAt:new Date(f.now()+60000).toISOString()});const id=created.data.id;await f.approve(id);
 assert.equal((await f.join(id)).status,409);const row=f.records.get('events/'+id+'.json');f.at(Date.parse(row.opensAt));const challenge=(await f.call('challenge')).data.challenge;f.advance(2500);
 assert.equal((await f.call('join',{id,name:'甲',platformId:'1',contact:'x',ticket:'e'.repeat(64),challenge})).status,201);
 f.at(Date.parse(row.closesAt)-2500);const valid=(await f.call('challenge')).data.challenge;f.at(Date.parse(row.closesAt));assert.equal((await f.call('join',{id,name:'乙',platformId:'2',contact:'y',ticket:'f'.repeat(64),challenge:valid})).status,409);
 const current=(await f.call('challenge')).data.challenge;f.advance(2500);assert.equal((await f.call('join',{id,name:'乙',platformId:'2',contact:'y',ticket:'f'.repeat(64),challenge:current})).status,409);
});
test('duplicate identity does not overwrite an entry; retries and restarts preserve receipt and counts',async()=>{
 const f=fixture(),id=(await f.create()).data.id;await f.approve(id);const challenge=await f.challenge(),entry={id,name:'甲',platformId:'222',contact:'private',ticket:'e'.repeat(64),challenge};
 const a=await f.call('join',entry),b=await f.call('join',entry);assert.equal(a.status,201);assert.equal(b.data.duplicate,true);assert.equal(a.data.entryId,b.data.entryId);
 assert.equal((await f.join(id,{platformId:'222',ticket:'f'.repeat(64),contact:'cannot replace'})).status,409);
 f.restart();const management=await f.call('manage',{id,ticket:f.ticket});assert.equal(management.data.item.registrations,1);assert.equal(management.data.participants[0].contact,'private');
 const key=[...f.records.keys()].find(k=>k.startsWith('event-entries/'));const prefix=key.slice(0,key.lastIndexOf('_'));f.records.set(prefix+'_'+'c'.repeat(64)+'.json',{...f.records.get(key),contact:'race duplicate'});
 assert.equal((await f.call('list',undefined,{id})).data.item.registrations,1);
});
test('withdrawal hides event and closes signup while preserving organizer access and attendance',async()=>{
 const f=fixture(),id=(await f.create()).data.id,{auth,item}=await f.approve(id);await f.join(id);f.advance(1);
 assert.equal((await f.call('review',{id,status:'rejected',reason:'规则变更',version:null},{},auth)).status,409);
 assert.equal((await f.call('review',{id,status:'rejected',reason:'',version:item.version},{},auth)).status,400);
 assert.equal((await f.call('review',{id,status:'rejected',reason:'本次赛事取消',version:item.version},{},auth)).status,200);
 assert.deepEqual((await f.call('list')).data.items,[]);assert.equal((await f.join(id,{platformId:'3'})).status,404);
 const own=(await f.call('manage',{id,ticket:f.ticket})).data;assert.equal(own.item.status,'rejected');assert.equal(own.item.registrations,1);assert.equal(own.item.reason,'本次赛事取消');
});
test('same-origin protection, verification and expired application deadlines are enforced for event writes',async()=>{
 const f=fixture(),challenge=await f.challenge(),input={...f.event(),ticket:f.ticket,challenge};
 assert.equal((await f.call('create',input,{}, {Origin:'https://evil.example'})).status,403);
 assert.equal((await f.call('create',{...input,challenge:'forged'})).status,400);
 assert.equal((await f.call('create',{...input,website:'spam'})).status,400);
 assert.equal((await f.call('create',{...input,closesAt:new Date(f.now()-1).toISOString()})).status,400);
 const p=f.records.size;assert.equal((await f.call('manage',{id:'unknown',ticket:f.ticket})).status,404);assert.equal(f.records.size,p);
});
