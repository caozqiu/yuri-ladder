// One-time test explicitly authorized by the owner: two private pending records.
// Never approve them. This script is not part of the hourly scheduled path.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {getStore} from '@edgeone/pages-blob';
import {PROJECT_ID} from './deploy.mjs';
import {sponsorIdentity,validateSponsor} from '../shared/lib/sponsors.mjs';
import {validateEvent} from '../shared/lib/events.mjs';
const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn',token=process.env.EDGEONE_API_TOKEN;
if(!token)throw Error('Verification credential missing');
const storage=getStore({name:'yuri-sponsored-matches',projectId:PROJECT_ID,token,consistency:'strong'}),fixtures=[];
let cleanedCount=0;
async function call(path,action,body){
 const r=await fetch(origin+'/api/'+path+'?'+new URLSearchParams({action,_verify:String(Date.now())}),{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{Accept:'application/json'})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(45000)});
 return {status:r.status,data:await r.json()};
}
try{
 let denied;for(let n=0;n<6;n++){denied=await call('events','review',{id:'verification',status:'approved'});if(denied.status===401)break;await new Promise(r=>setTimeout(r,10000));}assert.equal(denied.status,401,'deployed JSON body parsing and anonymous review denial');
 const source=await call('sponsors','import',{platformA:'3764069',platformB:'2511624',matchId:'1568734715984187392'});assert.equal(source.status,200,'deployed match import: '+(source.data.error||''));
 const ticket=randomBytes(32).toString('hex'),challenge=(await call('sponsors','challenge')).data.challenge;
 const data=validateSponsor({playerA:'自动验收选手A',playerB:'自动验收选手B',platformA:'3764069',platformB:'2511624',playedAt:new Date(source.data.round.start*1000).toISOString(),scoreA:1,scoreB:0,sponsor:'自动验收临时待审记录，请勿审核',replayUrl:'https://www.bilibili.com/video/BV1verification/',rounds:[source.data.round]});
 const identity=await sponsorIdentity(data,ticket,challenge);fixtures.push({key:'applications/'+identity.id+'.json',ticket});await new Promise(r=>setTimeout(r,2200));
 const pending=await call('sponsors','submit',{...data,ticket,challenge});assert.equal(pending.status,201,'actual deployed pending sponsor submission');assert.equal(pending.data.id,identity.id);
 const receipt=await call('sponsors','receipt',{id:identity.id,ticket});assert.equal(receipt.status,200);assert.equal(receipt.data.item.status,'pending');assert.equal(receipt.data.item.replayUrl,data.replayUrl);
 const hidden=await fetch(origin+'/api/sponsors?'+new URLSearchParams({action:'list',id:identity.id}));assert.equal(hidden.status,404);
 const eventTicket=randomBytes(32).toString('hex'),eventChallenge=(await call('events','challenge')).data.challenge,now=Date.now();
 const event=validateEvent({title:'自动验收临时办赛申请（请勿审核）',organizer:'自动验收',description:'所有者已授权的一次性待审测试；不会公开，请勿审核。',format:'1v1 BO3',contact:'',opensAt:new Date(now-60000).toISOString(),closesAt:new Date(now+3600000).toISOString(),startsAt:new Date(now+7200000).toISOString()});
 const eventIdentity=await sponsorIdentity(event,eventTicket,eventChallenge);fixtures.push({key:'events/'+eventIdentity.id+'.json',ticket:eventTicket});await new Promise(r=>setTimeout(r,2200));
 const created=await call('events','create',{...event,ticket:eventTicket,challenge:eventChallenge});assert.equal(created.status,201,'actual deployed pending event submission');assert.equal(created.data.id,eventIdentity.id);
 const management=await call('events','manage',{id:created.data.id,ticket:eventTicket});assert.equal(management.status,200);assert.equal(management.data.item.status,'pending');assert.equal(management.data.item.registrations,0);
}finally{
 let cleaned=0;
 for(const fixture of fixtures){const row=await storage.get(fixture.key,{type:'json',consistency:'strong'});if(!row)continue;const hash=createHash('sha256').update(fixture.ticket).digest('hex');if(row.ticketHash!==hash)throw Error('Temporary test record identity check failed; no deletion performed');await storage.delete(fixture.key);assert.equal(await storage.get(fixture.key,{consistency:'strong'}),null);cleaned++;}
 cleanedCount=cleaned;
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/live-submission-cleanup.json',JSON.stringify({at:new Date().toISOString(),testRecordsPlanned:2,createdRecordsCleaned:cleaned,publicTestRecords:0})+'\n');console.log(JSON.stringify({temporaryPendingRecordsCleaned:cleaned,publicTestRecords:0}));
}
assert.equal(cleanedCount,2,'Both owner-authorized records must be found and deleted');
const evidence={at:new Date().toISOString(),origin,deployedJsonBodyVerified:true,deployedOfficialImportVerified:true,sponsorSubmissionAndReceiptVerified:true,eventSubmissionAndManagementVerified:true,temporaryPendingRecordsCleaned:cleanedCount,publicTestRecords:0};
await writeFile('.runtime/live-submission-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
