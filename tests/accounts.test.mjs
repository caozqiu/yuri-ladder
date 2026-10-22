import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountsHandler,currentAccount} from '../src/accounts-api.mjs';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {accountId,validateAvatar,validateNickname} from '../shared/lib/accounts.mjs';
import {hashPassword,verifyPassword,DUMMY_HASH} from '../src/passwords.mjs';
const secret='isolated-account-test-owner-configuration',password='local-account-password-123';
import {AVATAR as png} from './fixtures/avatar.mjs';
function memory(){const values=new Map();return {values,async get(k){return structuredClone(values.get(k)||null);},async setJSON(k,v){values.set(k,structuredClone(v));},async list({prefix='',cursor='',limit=30}={}){const keys=[...values.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:null};}};}
function fixture(){const store=memory();let clock=1792634400000,handler=createAccountsHandler({store,secret,now:()=>clock});async function call(action,body,cookie='',extra={}){const request=new Request('https://account.test/api/account?'+new URLSearchParams({action,...extra}),{method:body?'POST':'GET',headers:{Origin:'https://account.test',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const r=await handler(request),image=r.headers.get('Content-Type')?.startsWith('image/');return {status:r.status,data:image?new Uint8Array(await r.arrayBuffer()):await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0],headers:r.headers};}return {store,call,now:()=>clock,advance:ms=>clock+=ms,restart:()=>handler=createAccountsHandler({store,secret:'changed-owner-password-without-changing-member-sessions',now:()=>clock}),async register(key='a'.repeat(64)){const c=await call('challenge');clock+=2500;return call('register',{nickname:'测试昵称',password,registrationKey:key,challenge:c.data.challenge});}};}
test('registration issues an independent member account; only salted hashes and hashed sessions persist',async()=>{
 const f=fixture(),r=await f.register();assert.equal(r.status,201);assert.equal(r.data.user.id,await accountId('a'.repeat(64)));assert.equal(r.data.user.nickname,'测试昵称');
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api'])assert.ok(r.headers.get('Set-Cookie').includes(flag));
 const stored=JSON.stringify([...f.store.values.values()]);assert.ok(!stored.includes(password));assert.ok(!stored.includes('a'.repeat(64)));assert.ok(!stored.includes(r.cookie.split('=')[1]));
 const record=f.store.values.get('users/'+r.data.user.id+'.json');assert.equal(record.passwordHash.length,60);assert.ok(record.passwordHash.startsWith('$2b$10$'));assert.equal(record.salt,undefined);
 const session=await f.call('session',undefined,r.cookie);assert.equal(session.data.user.id,r.data.user.id);assert.equal(session.data.user.version,undefined);f.restart();assert.equal((await f.call('session',undefined,r.cookie)).data.user.id,r.data.user.id);
});
test('password login rejects invalid, unknown, and tampered credentials; logout and expiration revoke sessions',async()=>{
 const f=fixture(),r=await f.register(),id=r.data.user.id;assert.equal((await f.call('login',{id,password:'wrong'})).status,401);assert.equal((await f.call('login',{id:'YR-'+'F'.repeat(24),password})).status,401);
 const login=await f.call('login',{id:id.toLowerCase(),password});assert.equal(login.status,200);assert.equal((await f.call('session',undefined,login.cookie+'forged')).data.user,null);
 await f.call('logout',{},login.cookie);assert.equal((await f.call('session',undefined,login.cookie)).data.user,null);f.advance(30*86400000+1);assert.equal((await f.call('session',undefined,r.cookie)).data.user,null);
});
test('registration retries preserve the same account rather than overwriting its credentials or nickname',async()=>{
 const f=fixture(),r=await f.register();const c=await f.call('challenge');f.advance(2500);const again=await f.call('register',{nickname:'不得覆盖',password:'different-password-123',registrationKey:'a'.repeat(64),challenge:c.data.challenge});
 assert.equal(again.data.user.id,r.data.user.id);assert.equal(again.data.user.nickname,'测试昵称');assert.equal(again.data.duplicate,true);assert.equal([...f.store.values.keys()].filter(k=>k.startsWith('users/')).length,1);assert.equal((await f.call('login',{id:r.data.user.id,password})).status,200);
});
test('profile changes and validated avatar uploads are scoped to the authenticated user; public view hides secrets',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b'.repeat(64));const r=await f.call('profile',{nickname:'新昵称',avatar:png,id:b.data.user.id},a.cookie);assert.equal(r.status,200);assert.equal(r.data.user.id,a.data.user.id);
 assert.equal((await f.call('session',undefined,b.cookie)).data.user.nickname,'测试昵称');const profile=await f.call('profile',undefined,'',{id:a.data.user.id});assert.deepEqual(Object.keys(profile.data.user).sort(),['avatar','createdAt','id','nickname']);
 const image=await f.call('avatar',undefined,'',{id:a.data.user.id});assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(image.data[0],137);assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal((await f.call('profile',{nickname:'匿名修改'})).status,401);assert.equal((await f.call('profile',{nickname:'新昵称',avatar:'data:image/svg+xml;base64,PHN2Zz4='},a.cookie)).status,400);assert.equal((await f.call('profile',{nickname:'新昵称',avatar:null},a.cookie)).data.user.avatar,null);
});
test('changing or recovering a password invalidates all prior member sessions without affecting another account',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b'.repeat(64)),id=a.data.user.id;
 assert.equal((await f.call('password',{oldPassword:'wrong',newPassword:'new-password-123'},a.cookie)).status,401);
 const changed=await f.call('password',{oldPassword:password,newPassword:'new-password-123'},a.cookie);assert.equal(changed.status,200);assert.equal((await f.call('session',undefined,a.cookie)).data.user,null);assert.equal((await f.call('session',undefined,b.cookie)).data.user.id,b.data.user.id);
 assert.equal((await f.call('recover',{id,recoveryKey:'c'.repeat(64),newPassword:password})).status,401);const recovered=await f.call('recover',{id,recoveryKey:'a'.repeat(64),newPassword:password});assert.equal(recovered.status,200);assert.equal((await f.call('session',undefined,changed.cookie)).data.user,null);assert.equal((await f.call('login',{id,password})).status,200);
});
test('avatar dimensions, signatures, active formats and nickname controls are rejected',()=>{
 assert.equal(validateAvatar(png).width,32);for(const input of ['data:image/png;base64,'+btoa('<html>'+ 'a'.repeat(80)),'data:image/svg+xml;base64,PHN2Zz4=',png+'a'])assert.throws(()=>validateAvatar(input));
 for(const name of ['', 'x'.repeat(25),'伪装\u202e姓名'])assert.throws(()=>validateNickname(name));
});
test('member endpoints enforce same-origin JSON, registration delay, and configured owner boundary',async()=>{
 const f=fixture(),handler=createAccountsHandler({store:f.store,secret,now:f.now});const challenge=(await f.call('challenge')).data.challenge,payload={nickname:'测试',password,registrationKey:'d'.repeat(64),challenge};assert.equal((await f.call('register',payload)).status,400);
 for(const [headers,expected]of [[{Origin:'https://other.test','Content-Type':'application/json'},403],[{Origin:'https://account.test','Content-Type':'text/plain'},415]])assert.equal((await handler(new Request('https://account.test/api/account?action=register',{method:'POST',headers,body:JSON.stringify(payload)}))).status,expected);
 const disabled=createAccountsHandler({store:f.store,secret:'short'});assert.equal((await disabled(new Request('https://account.test/api/account?action=challenge'))).status,503);
});
test('member ownership restores sponsor applications and events across devices without granting review privileges',async()=>{
 const f=fixture(),a=await f.register(),b=await f.register('b'.repeat(64)),store=memory();const handler=createSponsorsHandler({store,secret,accountsStore:f.store,now:f.now});
 async function call(path,action,body,cookie='',params={}){const r=await handler(new Request('https://account.test/api/'+path+'?'+new URLSearchParams({action,...params}),{method:body?'POST':'GET',headers:{Origin:'https://account.test',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};}
 let c=await call('sponsors','challenge');f.advance(2500);const applied=await call('sponsors','submit',{playerA:'甲',playerB:'乙',playedAt:'2026-10-22T10:00:00+08:00',scoreA:1,scoreB:0,ticket:'d'.repeat(64),challenge:c.data.challenge,ownerId:b.data.user.id},a.cookie);assert.equal(applied.status,201);
 assert.equal((await call('sponsors','mine',undefined,a.cookie)).data.items.length,1);assert.equal((await call('sponsors','mine',undefined,b.cookie)).data.items.length,0);assert.equal((await call('sponsors','receipt',{id:applied.data.id},a.cookie)).status,200);assert.equal((await call('sponsors','receipt',{id:applied.data.id},b.cookie)).status,404);assert.equal((await call('sponsors','review',{id:applied.data.id,status:'approved'},a.cookie)).status,401);
 c=await call('events','challenge');f.advance(2500);const now=f.now(),created=await call('events','create',{title:'账号关联测试赛',organizer:'测试发起人',description:'隔离测试，不公开',format:'BO3',opensAt:new Date(now-1000).toISOString(),closesAt:new Date(now+3600000).toISOString(),startsAt:new Date(now+7200000).toISOString(),ticket:'e'.repeat(64),challenge:c.data.challenge},a.cookie);assert.equal(created.status,201);
 assert.equal((await call('events','manage',{id:created.data.id},a.cookie)).status,200);assert.equal((await call('events','manage',{id:created.data.id},b.cookie)).status,404);assert.equal((await call('events','mine',undefined,a.cookie)).data.items.length,1);assert.equal((await call('events','mine',undefined)).status,401);
 const owner=await call('sponsors','login',{password:secret});await call('events','review',{id:created.data.id,status:'approved'},owner.cookie);c=await call('events','challenge');f.advance(2500);const joined=await call('events','join',{id:created.data.id,name:'报名者',platformId:'123456',qq:'1357913579',ticket:'f'.repeat(64),challenge:c.data.challenge},b.cookie);assert.equal(joined.status,201);
 assert.equal((await call('events','mine',undefined,b.cookie)).data.entries.length,1);const entry=await call('events','entry',{id:created.data.id,entryId:joined.data.entryId},b.cookie);assert.equal(entry.data.entry.qq,'1357913579');assert.equal(entry.data.entry.ownerId,undefined);assert.equal((await call('events','entry',{id:created.data.id,entryId:joined.data.entryId},a.cookie)).status,404);
 assert.ok(!JSON.stringify((await call('events','list',undefined,'',{id:created.data.id})).data).includes('1357913579'));
});

test('password hashing uses random bcrypt salts without requiring unsupported PBKDF2 APIs',async(t)=>{
 t.mock.method(crypto.subtle,'importKey',()=>{throw Error('Native PBKDF2 unavailable');});
 const first=await hashPassword('fixture-password'),second=await hashPassword('fixture-password');assert.notEqual(first,second);
 assert.equal(await verifyPassword('fixture-password',first),true);assert.equal(await verifyPassword('wrong-password',first),false);
 assert.equal(await verifyPassword('nonexistent-account-dummy-password',DUMMY_HASH),true);
 await assert.rejects(hashPassword('密'.repeat(25)));await assert.rejects(hashPassword('a'.repeat(73)));
});
