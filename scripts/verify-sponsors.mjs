import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {getStore} from '@edgeone/pages-blob';
import {PROJECT_ID} from './deploy.mjs';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {createAccountsHandler} from '../src/accounts-api.mjs';
const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn';
async function live(action,path='sponsors'){
 let error;
 for(let i=0;i<6;i++){
  try{const r=await fetch(origin+'/api/'+path+'?'+new URLSearchParams({action,_verify:Date.now()+'-'+i}),{cache:'no-store',signal:AbortSignal.timeout(45000)});const data=await r.json();if(action==='session'&&(r.status!==200||!data.configured))throw Error('Sponsor endpoint not ready');return {status:r.status,data};}
  catch(e){error=e;if(i<5)await new Promise(r=>setTimeout(r,10000));}
 }
 throw error;
}
const session=await live('session');assert.equal(session.data.configured,true);assert.equal(session.data.owner,false);
const queue=await live('queue');assert.equal(queue.status,401);
const publicList=await live('list');assert.equal(publicList.status,200);assert.ok(Array.isArray(publicList.data.items));assert.ok(publicList.data.items.every(r=>r.status==='approved'&&!('ticketHash' in r)));
// Exercise approval transitions in an isolated private verification namespace.
// Do not log in to the production owner account or publish a fabricated event.
const token=process.env.EDGEONE_API_TOKEN;if(!token)throw Error('Verification credential missing');
const eventSession=await live('session','events');assert.equal(eventSession.data.configured,true);assert.equal((await live('queue','events')).status,401);assert.equal((await live('list','events')).status,200);
const opts={name:'yuri-sponsor-verification',projectId:PROJECT_ID,token,consistency:'strong'};
const storage=getStore(opts),written=new Set();
const store={get:(...a)=>storage.get(...a),list:(...a)=>storage.list(...a),async setJSON(key,value,options){written.add(key);return storage.setJSON(key,value,options);}};
let now=Date.now();const secret=randomBytes(32).toString('hex');
let memberCookie='';let handler=createSponsorsHandler({store,accountsStore:store,secret,now:()=>now});
async function call(action,body,headers={},params={},path='sponsors'){
 const url='https://verification.invalid/api/'+path+'?'+new URLSearchParams({action,...params});
 const response=await handler(new Request(url,{method:body?'POST':'GET',headers:{Origin:'https://verification.invalid',Cookie:['submit','import','create','join'].includes(action)?memberCookie:'',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));
 const data=await response.json();return {status:response.status,data,cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
}
try{
 const accounts=createAccountsHandler({store,secret,now:()=>now});
 async function memberCall(action,body){const r=await accounts(new Request('https://verification.invalid/api/account?action='+action,{method:body?'POST':'GET',headers:{Origin:'https://verification.invalid',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};}
 const memberChallenge=(await memberCall('challenge')).data.challenge;now+=2500;
 const member=await memberCall('register',{nickname:'隔离赛事验收会员',password:randomBytes(24).toString('hex'),registrationKey:randomBytes(32).toString('hex'),challenge:memberChallenge});assert.equal(member.status,201);memberCookie=member.cookie;
 for(const [path,action]of [['events','create'],['events','join'],['sponsors','submit'],['sponsors','import']]){const r=await fetch(origin+'/api/'+path+'?action='+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401,'anonymous '+path+'/'+action);}
 const known=await call('import',{platformA:'3764069',platformB:'2511624',matchId:'1568734715984187392'});assert.equal(known.status,200);await new Promise(r=>setTimeout(r,2100));const imported=await call('import',{platformNameA:known.data.nameA,platformNameB:known.data.nameB,matchId:'1568734715984187392'});assert.equal(imported.status,200,'official source import');assert.equal(imported.data.round.winner,'a');
 const challenge=(await call('challenge')).data.challenge;now+=2500;const ticket=randomBytes(32).toString('hex');
 const application={playerA:'存储验收A',playerB:'存储验收B',platformA:'3764069',platformB:'2511624',playedAt:new Date(imported.data.round.start*1000).toISOString(),platformNameA:imported.data.nameA,platformNameB:imported.data.nameB,scoreA:2,scoreB:0,sponsor:'自动验收，仅在隔离命名空间',replayUrl:'https://www.bilibili.com/video/BV1verification/',rounds:[imported.data.round,{map:'手填国家验收',winner:'a',countryA:0,countryB:6}],challenge,ticket};
 const applied=await call('submit',application);assert.equal(applied.status,201);const id=applied.data.id;
 // A fresh SDK instance and handler must see the persisted object.
 const fresh=getStore(opts);handler=createSponsorsHandler({store:{...store,get:(...a)=>fresh.get(...a)},accountsStore:store,secret,now:()=>now});
 assert.equal((await call('receipt',{id,ticket})).data.item.status,'pending');
 assert.equal((await call('list',undefined,{}, {id})).status,404);
 assert.equal((await call('queue')).status,401);
 const login=await call('login',{password:secret});assert.equal(login.status,200);const auth={Cookie:login.cookie};
 let reviewed=await call('review',{id,status:'approved',version:null},auth);assert.equal(reviewed.status,200);
 const item=(await call('list',undefined,{}, {id})).data.item;assert.equal(item.status,'approved');assert.equal(item.rounds[0].matchId,'1568734715984187392');assert.equal(item.rounds[0].proof,undefined);assert.equal(item.replayUrl,application.replayUrl);assert.equal(item.platformNameA,application.platformNameA);assert.equal(item.rounds[1].countryA,0);assert.equal(item.rounds[1].countryB,6);
 now++;reviewed=await call('review',{id,status:'rejected',reason:'隔离验收结束',version:reviewed.data.item.version},auth);assert.equal(reviewed.status,200);
 assert.equal((await call('list',undefined,{}, {id})).status,404);assert.equal((await call('receipt',{id,ticket})).data.item.status,'rejected');
 const eChallenge=(await call('challenge',undefined,{}, {},'events')).data.challenge;now+=2500;
 const eTicket=randomBytes(32).toString('hex'),event={title:'隔离存储验收赛事',organizer:'自动验收',description:'仅在私有验收命名空间中测试，不对外发布。',format:'1v1 BO3',contact:'',opensAt:new Date(now-60000).toISOString(),closesAt:new Date(now+3600000).toISOString(),startsAt:new Date(now+7200000).toISOString(),ticket:eTicket,challenge:eChallenge};
 const created=await call('create',event,{}, {},'events');assert.equal(created.status,201);const eventId=created.data.id;
 assert.equal((await call('list',undefined,{}, {id:eventId},'events')).status,404);
 assert.equal((await call('review',{id:eventId,status:'approved'},auth,{},'events')).status,200);
 const signupChallenge=(await call('challenge',undefined,{}, {},'events')).data.challenge;now+=2500;
 const participant=await call('join',{id:eventId,name:'隔离测试圈内昵称',platformName:'LBW隔离验收昵称',qq:'1357913579',ticket:randomBytes(32).toString('hex'),challenge:signupChallenge},{}, {},'events');assert.equal(participant.status,201);
 let management;
 for(let i=0;i<7;i++){management=await call('manage',{id:eventId,ticket:eTicket},{}, {},'events');if(management.status===200&&management.data.item.registrations===1&&management.data.participants.length===1)break;await new Promise(r=>setTimeout(r,5000));}
 assert.equal(management.status,200);assert.equal(management.data.item.registrations,1);assert.equal(management.data.participants[0].platformName,'LBW隔离验收昵称');assert.equal(management.data.participants[0].platformId,undefined);assert.equal(management.data.participants[0].qq,'1357913579');
 const eventPublic=await call('list',undefined,{}, {id:eventId},'events');assert.equal(eventPublic.status,200);assert.ok(!JSON.stringify(eventPublic.data).includes('1357913579'));
 const evidence={at:new Date().toISOString(),origin,publicEndpointReady:true,anonymousQueueStatus:401,storage:'EdgeOne Blob, isolated verification namespace',freshInstanceRead:true,officialSourceImport:true,largeMatchIdPreserved:true,replayLinkPreserved:true,privatePending:true,approvalPublished:true,rejectionHidden:true,eventApplicationVerified:true,eventSignupVerified:true,organizerCountVerified:true,participantPrivacyVerified:true,memberLoginRequiredForWrites:true,privateQqVerified:true,nicknameOnlyImportVerified:true,manualCountryAndPlatformNamesVerified:true,eventSignupPlatformNicknameVerified:true,productionTestEventsCreated:0,productionTestAccountsCreated:0};
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/sponsor-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{for(const key of written)await storage.delete(key);}
