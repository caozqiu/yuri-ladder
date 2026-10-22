import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {getStore} from '@edgeone/pages-blob';
import {createAccountsHandler} from '../src/accounts-api.mjs';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {randomKey} from '../shared/lib/accounts.mjs';
import {AVATAR} from '../tests/fixtures/avatar.mjs';
import {PROJECT_ID} from './deploy.mjs';
const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn',token=process.env.EDGEONE_API_TOKEN;
if(!token)throw Error('Verification credential missing');
async function live(action,body){const r=await fetch(origin+'/api/account?'+new URLSearchParams({action,_verify:String(Date.now())}),{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
let session;for(let n=0;n<6;n++){session=await live('session');if(session.status===200&&session.data.configured)break;await new Promise(r=>setTimeout(r,10000));}assert.equal(session.status,200);assert.equal(session.data.configured,true);assert.equal(session.data.user,null);
const denied=await live('profile',{nickname:'must-not-write'});assert.equal(denied.status,401,'deployed profile write denies anonymous visitors');
const nonexistent='YR-'+randomKey(12).toUpperCase();const unknown=await fetch(origin+'/api/account?'+new URLSearchParams({action:'profile',id:nonexistent}));assert.equal(unknown.status,404,'deployed account storage point read');const loginDenied=await live('login',{id:nonexistent,password:'nonexistent-account-crypto-check'});assert.equal(loginDenied.status,401,'deployed native JSON and PBKDF2 runtime: '+(loginDenied.data.code||''));
for(const path of ['sponsors','events'])assert.equal((await fetch(origin+'/api/'+path+'?action=mine')).status,401);
const suffix=Date.now()+'-'+randomKey(4),written=[],accountStore=getStore({name:'yuri-account-verify-'+suffix,projectId:PROJECT_ID,token,consistency:'strong'}),communityStore=getStore({name:'yuri-community-verify-'+suffix,projectId:PROJECT_ID,token,consistency:'strong'});
const wrap=s=>({get:(...args)=>s.get(...args),list:(...args)=>s.list(...args),async setJSON(key,value,options){written.push({s,key});return s.setJSON(key,value,options);}});
const accounts=wrap(accountStore),community=wrap(communityStore),secret=randomKey();let now=Date.now(),handler=createAccountsHandler({store:accounts,secret,now:()=>now});
async function call(action,body,cookie='',params={}){const r=await handler(new Request('https://isolated-accounts.test/api/account?'+new URLSearchParams({action,...params}),{method:body?'POST':'GET',headers:{Origin:'https://isolated-accounts.test',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:r.headers.get('Content-Type').startsWith('image/')?new Uint8Array(await r.arrayBuffer()):await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};}
try{
 const key=randomKey(),challenge=(await call('challenge')).data.challenge;now+=2500;const registered=await call('register',{nickname:'隔离账号验收',password:'isolated-fixture-password-123',registrationKey:key,challenge});assert.equal(registered.status,201);
 const profile=await call('profile',{nickname:'头像昵称验收',avatar:AVATAR},registered.cookie);assert.equal(profile.status,200);assert.ok(profile.data.user.avatar);
 handler=createAccountsHandler({store:wrap(getStore({name:'yuri-account-verify-'+suffix,projectId:PROJECT_ID,token,consistency:'strong'})),secret,now:()=>now});
 const login=await call('login',{id:registered.data.user.id,password:'isolated-fixture-password-123'});assert.equal(login.status,200);assert.equal(login.data.user.nickname,'头像昵称验收');assert.equal((await call('avatar',undefined,'',{id:registered.data.user.id})).status,200);
 const publicProfile=await call('profile',undefined,'',{id:registered.data.user.id});assert.ok(!JSON.stringify(publicProfile.data).includes('passwordHash'));assert.ok(!JSON.stringify(publicProfile.data).includes(key));
 const sponsor=createSponsorsHandler({store:community,accountsStore:accounts,secret,now:()=>now});
 async function sponsorCall(action,body){const r=await sponsor(new Request('https://isolated-accounts.test/api/sponsors?action='+action,{method:body?'POST':'GET',headers:{Origin:'https://isolated-accounts.test',Cookie:login.cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json()};}
 const ch=(await sponsorCall('challenge')).data.challenge;now+=2500;assert.equal((await sponsorCall('submit',{playerA:'隔离验收甲',playerB:'隔离验收乙',scoreA:1,scoreB:0,playedAt:new Date(now).toISOString(),ticket:randomKey(),challenge:ch})).status,201);assert.equal((await sponsorCall('mine')).data.items.length,1);assert.equal((await sponsorCall('queue')).status,401);
 const recovered=await call('recover',{id:registered.data.user.id,recoveryKey:key,newPassword:'isolated-new-password-456'});assert.equal(recovered.status,200);assert.equal((await call('session',undefined,login.cookie)).data.user,null);await call('logout',{},recovered.cookie);assert.equal((await call('session',undefined,recovered.cookie)).data.user,null);
 const evidence={at:new Date().toISOString(),origin,publicAccountEndpointReady:true,anonymousProfileDenied:true,anonymousPersonalRecordsDenied:true,deployedNativeJsonAndPbkdf2Verified:true,isolatedCloudRegistration:true,freshInstanceLogin:true,nicknameAndAvatarPersisted:true,publicProfileHasNoCredentials:true,accountLinkedSponsorRestored:true,memberCannotReview:true,recoveryRevokesOldSessions:true,logoutRevokesSession:true,productionAccountsCreated:0};
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/account-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{for(const {s,key}of written)await s.delete(key);}
