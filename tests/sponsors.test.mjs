import test from 'node:test';
import {fixtureMember} from './fixtures/member.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {createFileStore} from '../src/sponsors-file-store.mjs';
import {validateSponsor,beijingInputToIso,sponsorIdentity} from '../shared/lib/sponsors.mjs';
import {normalizeSponsorMatch,normalizeSponsorMatchByNames,fetchSponsorMatch} from '../shared/lib/sponsor-source.mjs';
import {parseSourceJSON} from '../shared/lib/source-json.mjs';
const secret='unit-test-only-sponsor-owner-password';
const data={playerA:'甲',playerB:'乙',playedAt:'2026-10-22T10:00:00+08:00',scoreA:2,scoreB:1,sponsor:'测试赞助者',rounds:[{map:'地图一',winner:'a'}]};
const fixture=()=>{
 const values=new Map();let clock=1792634400000;
 const store={async get(k){return structuredClone(values.get(k)||null);},async setJSON(k,v){values.set(k,structuredClone(v));},async list({prefix,limit=30,cursor=''}){const keys=[...values.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:null};}};
 const member=fixtureMember(()=>clock);const opts={store,secret,now:()=>clock,accountsStore:member.store};let handle=createSponsorsHandler(opts);
 async function call(action,body,extra={},headers={}){await member.ready;const url=new URL('https://fixture.example/api/sponsors');url.search=new URLSearchParams({action,...extra});const r=await handle(new Request(url,{method:body?'POST':'GET',headers:{Origin:url.origin,Cookie:['submit','import'].includes(action)?member.cookie:'',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,json:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0],headers:r.headers};}
 return {values,store,call,opts,advance:n=>clock+=n,restart:()=>handle=createSponsorsHandler(opts),async apply(changes={}){const challenge=(await call('challenge')).json.challenge;clock+=2500;return call('submit',{...data,ticket:crypto.randomUUID().replaceAll('-','')+'a'.repeat(32),challenge,...changes});},async login(){const r=await call('login',{password:secret});assert.equal(r.status,200);return {Cookie:r.cookie};}};
};
test('sponsor inputs require distinct players, valid score, consistent partial rounds and timezone',()=>{
 assert.equal(validateSponsor(data).playedAt,'2026-10-22T02:00:00.000Z');assert.equal(beijingInputToIso('2026-10-22T10:00'),'2026-10-22T02:00:00.000Z');
 for(const bad of [{playerB:'甲'},{scoreA:0,scoreB:0},{scoreA:1.5},{scoreB:100},{rounds:[{map:'x',winner:'draw'}]},{scoreA:0},{rounds:[{map:'x',winner:'b'},{map:'y',winner:'b'}]},{playedAt:'2026-10-22T10:00'},{platformA:'42',platformB:'42'},{rounds:[{}]}])assert.throws(()=>validateSponsor({...data,...bad}));
 assert.equal(validateSponsor({...data,scoreA:1,scoreB:1,rounds:[]}).scoreB,1);
});
test('replay links are optional, retain normal video URLs and reject scripts, credential URLs and oversized values',()=>{
 assert.equal(validateSponsor(data).replayUrl,'');
 assert.equal(validateSponsor({...data,replayUrl:'https://www.bilibili.com/video/BV1test/?p=2&t=32'}).replayUrl,'https://www.bilibili.com/video/BV1test/?p=2&t=32');
 for(const replayUrl of ['javascript:alert(1)','data:text/html,x','file:///c:/secret','https://user:password@example.com/video','not a url','https://example.com/'+'x'.repeat(1000)])assert.throws(()=>validateSponsor({...data,replayUrl}));
});
test('member submission is private until owner approval; receipt is scoped and never public',async()=>{
 const f=fixture(),r=await f.apply({status:'approved'});assert.equal(r.status,201);const id=r.json.id;
 assert.deepEqual((await f.call('list')).json.items,[]);assert.equal((await f.call('list',undefined,{id})).status,404);
 assert.equal((await f.call('queue')).status,401);assert.equal((await f.call('review',{id,status:'approved'})).status,401);
 const record=f.values.get('applications/'+id+'.json');assert.ok(record.ticketHash);assert.equal(record.ticket,undefined);
 const headers=await f.login(),queue=(await f.call('queue',undefined,{},headers)).json.items;
 assert.equal(queue[0].status,'pending');assert.equal(queue[0].ticketHash,undefined);
 assert.equal((await f.call('review',{id,status:'approved',version:null}, {},headers)).status,200);
 const row=(await f.call('list')).json.items[0];assert.equal(row.status,'approved');assert.equal(row.id,id);assert.equal(row.ticketHash,undefined);assert.equal(row.reason,undefined);
});
test('owner rejection needs reason, removes publication and detects stale review revisions',async()=>{
 const f=fixture(),id=(await f.apply()).json.id,headers=await f.login();
 let r=await f.call('review',{id,status:'approved'},{},headers);const version=r.json.item.version;f.advance(1);
 assert.equal((await f.call('review',{id,status:'rejected',reason:'信息不符',version:null},{},headers)).status,409);
 assert.equal((await f.call('review',{id,status:'rejected',version},{},headers)).status,400);
 r=await f.call('review',{id,status:'rejected',reason:'资料不符，请核对',version},{},headers);assert.equal(r.status,200);
 assert.deepEqual((await f.call('list')).json.items,[]);assert.equal((await f.call('list',undefined,{id})).status,404);
 const row=(await f.call('queue',undefined,{},headers)).json.items[0];assert.equal(row.reason,'资料不符，请核对');
});
test('receipt requires the unpredictable secret and submit retries preserve one record',async()=>{
 const f=fixture(),ticket='b'.repeat(64),challenge=(await f.call('challenge')).json.challenge;f.advance(2500);
 const payload={...data,ticket,challenge},first=await f.call('submit',payload);const retry=await f.call('submit',payload);
 assert.equal(first.json.id,retry.json.id);assert.equal(retry.json.duplicate,true);assert.equal([...f.values.keys()].filter(k=>k.startsWith('applications/')).length,1);
 assert.equal((await f.call('receipt',{id:first.json.id,ticket:'c'.repeat(64)})).status,404);
 const receipt=await f.call('receipt',{id:first.json.id,ticket});assert.equal(receipt.status,200);assert.equal(receipt.json.item.status,'pending');assert.equal(receipt.json.item.ticketHash,undefined);
});
test('same-origin JSON, body size, challenge signature, expiry, honeypot and throttle are enforced',async()=>{
 const f=fixture(),challenge=(await f.call('challenge')).json.challenge,p={...data,ticket:'d'.repeat(64),challenge};
 assert.equal((await f.call('submit',p)).status,400);f.advance(2500);
 assert.equal((await f.call('submit',p,{}, {Origin:'https://attacker.example'})).status,403);
 assert.equal((await f.call('submit',p,{}, {'Content-Type':'text/plain'})).status,415);
 assert.equal((await f.call('submit',{...p,sponsor:'x'.repeat(25000)})).status,413);
 assert.equal((await f.call('submit',{...p,website:'spam'})).status,400);
 assert.equal((await f.call('submit',{...p,challenge:challenge+'bad'})).status,400);
 for(let n=0;n<5;n++)assert.equal((await f.apply()).status,201);
 assert.equal((await f.apply()).status,429);f.advance(21*60000);assert.equal((await f.call('submit',p)).status,400);
});
test('session cookie is HttpOnly, secure, expiring and independent of public URLs',async()=>{
 const f=fixture();assert.equal((await f.call('login',{password:'wrong'})).status,401);
 const r=await f.call('login',{password:secret});for(const flag of ['HttpOnly','SameSite=Strict','Secure','Path=/api'])assert.ok(r.headers.get('Set-Cookie').includes(flag));
 assert.equal((await f.call('session',undefined,{}, {Cookie:r.cookie})).json.owner,true);
 assert.equal((await f.call('queue',undefined,{password:secret})).status,401);
 assert.equal((await f.call('queue',undefined,{}, {Cookie:r.cookie+'forged'})).status,401);
 f.advance(8*3600000+1);assert.equal((await f.call('queue',undefined,{}, {Cookie:r.cookie})).status,401);
});
test('disabled owner configuration fails closed; failed approval never leaks a pending application',async()=>{
 const f=fixture();const h=createSponsorsHandler({store:f.store,secret:'short'});assert.equal((await h(new Request('https://x/api/sponsors?action=challenge'))).status,503);
 const id=(await f.apply()).json.id,headers=await f.login(),set=f.store.setJSON;f.store.setJSON=async(k,v)=>{if(k.startsWith('reviews/'))throw Error('storage failed');return set(k,v);};
 assert.equal((await f.call('review',{id,status:'approved'},{},headers)).status,503);
 assert.deepEqual((await f.call('list')).json.items,[]);assert.equal((await f.call('list',undefined,{id})).status,404);
});
test('local durable storage survives a new handler and pagination does not lose applications',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yuri-sponsor-test-'));
 try{const s=createFileStore(dir);await s.setJSON('applications/a.json',{v:1});assert.deepEqual(await createFileStore(dir).get('applications/a.json'),{v:1});
 for(let i=0;i<35;i++)await s.setJSON('applications/'+String(i).padStart(2,'0')+'.json',{i});
 const a=await s.list({prefix:'applications/',limit:30}),b=await s.list({prefix:'applications/',limit:30,cursor:a.cursor});assert.equal(new Set([...a.blobs,...b.blobs].map(k=>k.key)).size,36);
 await assert.rejects(s.get('../../escape.json'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
const source={matchId:'9223372036854775807',gameVersion:0,isEnd:1,playerCount:2,mapName:'赛事地图',startTime:1792634400,gameType:1,players:[{userId:11,username:'甲',country:0,matchStats:1,colorId:0},{userId:22,username:'乙',country:9,matchStats:0,colorId:1}]};
test('match import preserves big IDs, allows non-ladder sponsored rooms and verifies both IDs/results',()=>{
 const raw=parseSourceJSON(JSON.stringify(source).replace('"9223372036854775807"','9223372036854775807'));
 const r=normalizeSponsorMatch(raw,'9223372036854775807','11','22');assert.equal(r.round.matchId,'9223372036854775807');assert.equal(r.round.winner,'a');assert.equal(r.round.countryB,9);
 assert.equal(normalizeSponsorMatch(raw,'9223372036854775807','22','11').round.winner,'b');
 for(const changes of [{gameVersion:1},{playerCount:4},{isEnd:0},{players:source.players.map(p=>({...p,matchStats:2}))},{players:[source.players[0],{...source.players[1],userId:99}]}])assert.throws(()=>normalizeSponsorMatch({...source,...changes},source.matchId,'11','22'));
});
test('source fetch works on edge runtimes without AbortSignal.timeout and clears its timeout',async(t)=>{
 t.mock.method(AbortSignal,'timeout',()=>{throw Error('Unsupported static method');});
 let signal;
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.ok(url.endsWith(source.matchId));signal=options.signal;assert.equal(signal.aborted,false);return Response.json({success:true,data:source});});
 const imported=await fetchSponsorMatch(source.matchId,'11','22');assert.equal(imported.round.winner,'a');assert.equal(signal.aborted,false);
 globalThis.fetch.mock.mockImplementation(async()=>{throw Error('Upstream connection failed');});
 await assert.rejects(fetchSponsorMatch(source.matchId,'11','22'),{status:502});
});
test('import proof rejects edited maps, results, IDs and duplicate matches at submission',async()=>{
 const f=fixture();f.opts.sourceMatch=async(id,a,b)=>normalizeSponsorMatch(source,id,a,b);f.restart();
 const imported=await f.call('import',{platformA:'11',platformB:'22',matchId:source.matchId});assert.equal(imported.status,200);assert.ok(imported.json.round.proof);
 const r=imported.json.round,base={platformA:'11',platformB:'22',rounds:[r]};
 assert.equal((await f.apply(base)).status,201);
 assert.equal((await f.apply({...base,rounds:[{...r,map:'伪造地图'}]})).status,400);
 assert.equal((await f.apply({...base,rounds:[{...r,winner:'b'}]})).status,400);
 assert.equal((await f.apply({...base,platformB:'33'})).status,400);
 assert.equal((await f.apply({...base,rounds:[r,r]})).status,400);
});
test('edge request JSON parsing uses the native JSON reader without relying on raw stream access',async()=>{
 const handler=createSponsorsHandler({store:fixture().store,secret}),raw=JSON.stringify({id:'unknown',status:'approved'});
 for(const path of ['sponsors','events']){
  const r=new Request('https://fixture.example/api/'+path+'?action=review',{method:'POST',headers:{Origin:'https://fixture.example','Content-Type':'application/json'},body:raw});
  Object.defineProperty(r,'body',{get(){throw Error('Raw request stream unavailable in this edge runtime');}});
  assert.equal((await handler(r)).status,401);
 }
});

test('manual round countries and separate platform nicknames survive storage, receipt and public approval',async()=>{
 const ticket='6'.repeat(64),f=fixture(),r=await f.apply({ticket,platformNameA:'平台甲',platformNameB:'平台乙',rounds:[{map:'自填地图',winner:'a',countryA:0,countryB:6},{countryA:9}]});assert.equal(r.status,201);
 const id=r.json.id;f.restart();assert.equal((await f.call('receipt',{id,ticket})).json.item.rounds[0].countryA,0);const headers=await f.login();assert.equal((await f.call('review',{id,status:'approved'}, {},headers)).status,200);
 const item=(await f.call('list',undefined,{id})).json.item;assert.equal(item.playerA,'甲');assert.equal(item.platformNameA,'平台甲');assert.equal(item.platformNameB,'平台乙');assert.equal(item.rounds[0].countryA,0);assert.equal(item.rounds[0].countryB,6);assert.equal(item.rounds[1].countryA,9);assert.equal(item.rounds[1].countryB,undefined);
 for(const countryA of [-1,10,0.5,'0',false])assert.throws(()=>validateSponsor({...data,rounds:[{map:'地图',countryA}]}));
 for(const platformNameA of ['x'.repeat(65),'含\n换行',5])assert.throws(()=>validateSponsor({...data,platformNameA}));
});

test('nickname-only import identifies direction and internal IDs while refusing mismatched, ambiguous or changed players',async()=>{
 const r=normalizeSponsorMatchByNames(source,source.matchId,'乙','甲');assert.equal(r.platformA,'22');assert.equal(r.platformB,'11');assert.equal(r.round.winner,'b');
 assert.throws(()=>normalizeSponsorMatchByNames(source,source.matchId,'圈内别名','乙'));
 assert.throws(()=>normalizeSponsorMatchByNames({...source,players:source.players.map(p=>({...p,username:'同名'}))},source.matchId,'同名','乙'));
 const f=fixture();f.opts.sourceMatchByNames=async(id,a,b)=>normalizeSponsorMatchByNames(source,id,a,b);f.restart();
 const imported=await f.call('import',{platformNameA:'甲',platformNameB:'乙',matchId:source.matchId});assert.equal(imported.status,200);assert.equal(imported.json.platformA,'11');assert.equal(imported.json.platformB,'22');
 const base={platformA:imported.json.platformA,platformB:imported.json.platformB,platformNameA:'甲',platformNameB:'乙',rounds:[imported.json.round]};assert.equal((await f.apply(base)).status,201);
 assert.equal((await f.apply({...base,rounds:[{...imported.json.round,countryA:1}]})).status,400);
 assert.equal((await f.call('import',{platformNameA:'甲',platformNameB:'乙',platformA:'99',platformB:'22',matchId:source.matchId})).status,400);
});

test('blank optional platform nicknames preserve legacy submission retry identities',async()=>{
 const current=validateSponsor(data),legacy={...current};delete legacy.platformNameA;delete legacy.platformNameB;
 assert.equal((await sponsorIdentity(current,'a'.repeat(64),'apply.1792634400000.signature')).id,(await sponsorIdentity(legacy,'a'.repeat(64),'apply.1792634400000.signature')).id);
});
