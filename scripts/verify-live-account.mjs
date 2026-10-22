// Owner-authorized once: one temporary normal account, no event records.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {getStore} from '@edgeone/pages-blob';
import {PROJECT_ID} from './deploy.mjs';
import {randomKey,accountId,digest} from '../shared/lib/accounts.mjs';
import {AVATAR} from '../tests/fixtures/avatar.mjs';
const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn',token=process.env.EDGEONE_API_TOKEN;
if(!token)throw Error('Verification credential missing');
const store=getStore({name:'yuri-user-accounts',projectId:PROJECT_ID,token,consistency:'strong'}),key=randomKey(),id=await accountId(key),password=randomKey(),cookies=[];
const avatarKey='avatars/'+id+'/'+(await digest(AVATAR.split(',')[1])).slice(0,24)+'.json';
let cleaned=0,verified=false;
async function call(action,body,cookie='',params={}){
 const r=await fetch(origin+'/api/account?'+new URLSearchParams({action,...params,_verify:String(Date.now())}),{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const session=r.headers.get('Set-Cookie')?.split(';')[0];if(session&&!session.endsWith('='))cookies.push(session);
 const image=r.headers.get('Content-Type')?.startsWith('image/');return {status:r.status,data:image?new Uint8Array(await r.arrayBuffer()):await r.json(),cookie:session,type:r.headers.get('Content-Type')};
}
try{
 const denied=await call('login',{id:'YR-'+randomKey(12).toUpperCase(),password:'nonexistent-account-preflight'});assert.equal(denied.status,401,'deployed password hashing ready before creating account');
 const challenge=(await call('challenge')).data.challenge;await new Promise(r=>setTimeout(r,2200));
 const registered=await call('register',{nickname:'自动验收临时账号',password,registrationKey:key,challenge});assert.equal(registered.status,201,'one authorized live account registration');assert.equal(registered.data.user.id,id);assert.ok(registered.cookie);
 const profile=await call('profile',{nickname:'自动验收昵称与头像',avatar:AVATAR},registered.cookie);assert.equal(profile.status,200);assert.ok(profile.data.user.avatar);
 const publicProfile=await call('profile',undefined,'',{id});assert.equal(publicProfile.status,200);assert.equal(publicProfile.data.user.nickname,'自动验收昵称与头像');assert.deepEqual(Object.keys(publicProfile.data.user).sort(),['avatar','createdAt','id','nickname']);
 const avatar=await call('avatar',undefined,'',{id});assert.equal(avatar.status,200);assert.equal(avatar.type,'image/png');assert.equal(avatar.data[0],137);assert.ok(avatar.data.length>33);
 const login=await call('login',{id,password});assert.equal(login.status,200);assert.equal(login.data.user.nickname,'自动验收昵称与头像');assert.equal((await call('session',undefined,login.cookie)).data.user.id,id);
 await call('logout',{},registered.cookie);assert.equal((await call('session',undefined,registered.cookie)).data.user,null);assert.equal((await call('session',undefined,login.cookie)).data.user.id,id);
 verified=true;
}finally{
 const row=await store.get('users/'+id+'.json',{type:'json',consistency:'strong'});
 if(row){
  if(row.id!==id||row.recoveryHash!==await digest(key))throw Error('Test account identity mismatch; no account deletion performed');
  for(const cookie of new Set(cookies)){const sessionKey='sessions/'+await digest(cookie.split('=')[1])+'.json',session=await store.get(sessionKey,{type:'json',consistency:'strong'});if(session&&!session.revoked&&session.id!==id)throw Error('Test session identity mismatch');await store.delete(sessionKey);assert.equal(await store.get(sessionKey,{consistency:'strong'}),null);}
  for(const object of [avatarKey,'profiles/'+id+'.json','users/'+id+'.json']){await store.delete(object);assert.equal(await store.get(object,{consistency:'strong'}),null);}cleaned=1;
 }
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/live-account-cleanup.json',JSON.stringify({at:new Date().toISOString(),authorizedTestAccounts:1,testAccountsCleaned:cleaned,knownSessionsCleaned:new Set(cookies).size,eventRecordsCreated:0})+'\n');console.log(JSON.stringify({temporaryAccountCleaned:cleaned,eventRecordsCreated:0}));
}
assert.equal(cleaned,1);assert.equal(verified,true);assert.equal((await call('profile',undefined,'',{id})).status,404);
for(const cookie of cookies)assert.equal((await call('session',undefined,cookie)).data.user,null);
const evidence={at:new Date().toISOString(),origin,liveRegistrationVerified:true,liveLoginVerified:true,liveNicknameAndAvatarVerified:true,livePublicProfilePrivacyVerified:true,liveLogoutVerified:true,testAccountsCleaned:cleaned,productionEventRecordsCreated:0};
await writeFile('.runtime/live-account-verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
