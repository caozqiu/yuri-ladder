import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createAccountsHandler} from '../src/accounts-api.mjs';
test('account directory requires owner authorization and only reads public profile fields',async()=>{
 const secret='isolated-admin-account-directory-secret',now=1792634400000,values=new Map();let lists=0;
 for(let n=0;n<27;n++){const id='YR-'+String(n).padStart(24,'0');values.set('profiles/'+id+'.json',{id,nickname:'用户'+n,username:'player'+n,createdAt:new Date(now+n).toISOString(),avatarVersion:null,passwordHash:'should-never-leak',recoveryKey:'private'});values.set('users/'+id+'.json',{passwordHash:'never-read-this'});}
 const store={async get(k){assert.ok(!k.startsWith('users/'),'directory must not read credentials');return structuredClone(values.get(k)||null);},async list({prefix,cursor='',limit}){lists++;const keys=[...values.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:null};}};
 const handler=createAccountsHandler({store,secret,now:()=>now});
 const call=async(cookie='',cursor='')=>{const r=await handler(new Request('https://test.example/api/account?'+new URLSearchParams({action:'admin-users',cursor}),{headers:{Cookie:cookie}}));return {status:r.status,data:await r.json()};};
 assert.equal((await call()).status,401);assert.equal((await call('yuri_member_session='+'a'.repeat(64))).status,401);assert.equal(lists,0);
 const cookie=at=>'yuri_site_owner=owner.'+at+'.'+createHmac('sha256',secret).update('owner.'+at).digest('hex');
 assert.equal((await call(cookie(now-8*3600000-1))).status,401);assert.equal((await call(cookie(now)+'forged')).status,401);
 const first=await call(cookie(now));assert.equal(first.status,200);assert.equal(first.data.items.length,25);assert.ok(first.data.cursor);
 assert.ok(!JSON.stringify(first.data).includes('should-never-leak'));assert.ok(!JSON.stringify(first.data).includes('private'));
 const second=await call(cookie(now),first.data.cursor);assert.equal(second.data.items.length,2);assert.equal(new Set([...first.data.items,...second.data.items].map(u=>u.id)).size,27);
});
