import test from 'node:test';
import assert from 'node:assert/strict';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {ACCOUNT_COOKIE} from '../shared/lib/accounts.mjs';

const id='1792634400000_'+'a'.repeat(64);
function fixture(){
 const values=new Map(),calls=[];let active=0,maximum=0,accountReads=0;
 const pause=async value=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;return structuredClone(value);};
 const store={get(key,options){calls.push({key,options});return pause(values.get(key)||null);},async setJSON(){throw Error('Readonly verification');},list({prefix,limit=30}){calls.push({prefix});return pause({blobs:[...values.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key})),cursor:null});}};
 const now=1792634400000;
 values.set('event-public/'+id+'.json',{id});
 values.set('events/'+id+'.json',{id,title:'刷新测试赛',organizer:'公开发起人',description:'规则',format:'BO3',contact:'公开渠道',createdAt:new Date(now).toISOString(),opensAt:new Date(now-1000).toISOString(),closesAt:new Date(now+60000).toISOString(),startsAt:new Date(now+120000).toISOString(),ticketHash:'private-receipt'});
 values.set('event-states/'+id+'.json',{status:'approved',version:'v1',reason:'private-review',at:new Date(now).toISOString()});
 values.set('event-entries/'+id+'/'+'b'.repeat(64)+'_'+'c'.repeat(64)+'.json',{name:'保密报名者',qq:'123456789',ticketHash:'private-entry'});
 const handler=createSponsorsHandler({store,secret:'unit-test-only-list-performance-secret',now:()=>now,accountsStore:{get(){accountReads++;throw Error('Public reads must not depend on member storage');}}});
 const call=async(path,action='list',extra={})=>{const r=await handler(new Request('https://fixture.example/api/'+path+'?'+new URLSearchParams({action,...extra}),{headers:{Cookie:ACCOUNT_COOKIE+'='+'d'.repeat(64)}}));return {status:r.status,data:await r.json(),headers:r.headers};};
 return {values,calls,call,maximum:()=>maximum,accountReads:()=>accountReads};
}

test('event refresh overlaps metadata, authoritative moderation and attendance reads without accessing member storage',async()=>{
 const f=fixture(),r=await f.call('events');
 assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.equal(r.data.items[0].registrations,1);
 assert.ok(f.maximum()>=3,'independent event storage operations should overlap');assert.equal(f.accountReads(),0);
 assert.equal(f.calls.filter(c=>c.key==='events/'+id+'.json').length,1);
 assert.equal(f.calls.filter(c=>c.key==='event-states/'+id+'.json').length,1);
 assert.equal(f.calls.filter(c=>c.prefix==='event-entries/'+id+'/').length,1,'count is not fetched twice');
 for(const c of f.calls.filter(c=>c.key))assert.equal(c.options.consistency,'strong');
 for(const privateValue of ['123456789','private-entry','private-receipt','private-review','保密报名者'])assert.ok(!JSON.stringify(r.data).includes(privateValue));
 assert.match(r.headers.get('Cache-Control'),/no-store/);
 f.values.set('event-states/'+id+'.json',{status:'rejected',version:'v2'});
 assert.deepEqual((await f.call('events')).data.items,[],'each refresh reads current moderation and hides withdrawn events');
 assert.equal((await f.call('events','list',{id})).status,404);
});

test('public sponsor reads and session checks avoid unrelated account reads while private queues stay protected',async()=>{
 const f=fixture();
 f.values.set('published/'+id+'.json',{id});f.values.set('applications/'+id+'.json',{id,playerA:'甲',playerB:'乙',rounds:[],scoreA:2,scoreB:1,playedAt:'2026-10-22T10:00:00+08:00',createdAt:'2026-10-22T10:00:00+08:00',sponsor:'',ticketHash:'private-sponsor'});
 f.values.set('states/'+id+'.json',{status:'approved',version:'v1',reason:'private-reason'});
 const r=await f.call('sponsors');assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.ok(f.maximum()>=2);assert.equal(f.accountReads(),0);
 assert.ok(!JSON.stringify(r.data).includes('private-'));
 for(const path of ['events','sponsors']){
  assert.equal((await f.call(path,'session')).status,200);assert.equal((await f.call(path,'challenge')).status,200);
  assert.equal((await f.call(path,'queue')).status,401);
 }
 assert.equal(f.accountReads(),0);
 f.values.set('states/'+id+'.json',{status:'rejected',version:'v2'});assert.deepEqual((await f.call('sponsors')).data.items,[]);
});
