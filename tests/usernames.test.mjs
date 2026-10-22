import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createECDH} from 'node:crypto';
import {createAccountsHandler} from '../src/accounts-api.mjs';
import {accountError,normalizeUsername,validateUsername} from '../shared/lib/accounts.mjs';
import {usernameSigningScalar,base64url} from '../shared/lib/username-signing.mjs';
import {createUsernameRegistry} from '../src/username-registry.mjs';
const secret='isolated-unique-username-fixture-secret',password='fixture-username-password-123';
function fixture(){
 let now=1792634400000;const values=new Map(),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE names(name TEXT PRIMARY KEY,id TEXT NOT NULL)');
 const registry={async lookup(name){return db.prepare('SELECT id FROM names WHERE name=?').get(normalizeUsername(name))?.id||null;},async claim(name,id){const key=normalizeUsername(name);db.prepare('INSERT INTO names(name,id) VALUES (?,?) ON CONFLICT DO NOTHING').run(key,id);if(db.prepare('SELECT id FROM names WHERE name=?').get(key).id!==id)throw accountError('该用户名已被使用',409);return id;}};
 const store={async get(k){return structuredClone(values.get(k)||null);},async setJSON(k,v){values.set(k,structuredClone(v));}};
 const handler=createAccountsHandler({store,secret,now:()=>now,registry});
 const call=async(action,body,cookie='')=>{const r=await handler(new Request('https://username.test/api/account?action='+action,{method:body?'POST':'GET',headers:{Origin:'https://username.test',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};};
 const challenge=async()=>{const c=await call('challenge');now+=2500;return c.data.challenge;};
 return {db,values,store,registry,call,challenge,register:async(username,key='a'.repeat(64))=>call('register',{nickname:'展示昵称',username,password,registrationKey:key,challenge:await challenge()})};
}
test('unique usernames support case-normalized login, preserve ID fallback and reject concurrent duplicate registration',async()=>{
 const f=fixture();try{
  const challenge=await f.challenge(),results=await Promise.all(['a','b'].map(k=>f.call('register',{nickname:'展示昵称',username:'Ｐlayer_草籽',password,registrationKey:k.repeat(64),challenge})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal([...f.values.keys()].filter(k=>k.startsWith('users/')).length,1);
  const winner=results.find(r=>r.status===201),login=await f.call('login',{id:'PLAYER_草籽',password});assert.equal(login.status,200);assert.equal(login.data.user.id,winner.data.user.id);assert.equal((await f.call('login',{id:winner.data.user.id,password})).status,200);
  assert.equal((await f.call('login',{id:'player_草籽',password:'wrong'})).status,401);assert.equal((await f.call('login',{id:'unknown_user',password})).status,401);
  const changed=await f.call('profile',{nickname:'新的展示昵称',username:'Player_草籽'},login.cookie);assert.equal(changed.status,200);assert.equal(changed.data.user.username,'Player_草籽');
  assert.equal((await f.call('profile',{nickname:'新的展示昵称',username:'different_name'},login.cookie)).status,409);assert.equal((await f.call('login',{id:'player_草籽',password})).status,200);
 }finally{f.db.close();}
});
test('legacy accounts claim a username once without changing credentials or ownership; retry cannot change a registered username',async()=>{
 const f=fixture();try{
  const challenge=await f.challenge(),key='c'.repeat(64),legacy=await f.call('register',{nickname:'老昵称',password,registrationKey:key,challenge});assert.equal(legacy.status,201);assert.equal(legacy.data.user.username,undefined);
  const username=await f.call('profile',{nickname:'老昵称',username:'老用户'},legacy.cookie);assert.equal(username.status,200);assert.equal(username.data.user.id,legacy.data.user.id);assert.equal((await f.call('login',{id:'老用户',password})).status,200);
  const again=await f.call('register',{nickname:'不能覆盖',username:'不能覆盖',password:'another-password-123',registrationKey:key,challenge:await f.challenge()});assert.equal(again.data.duplicate,true);assert.equal(again.data.user.username,'老用户');assert.equal(again.data.user.nickname,'老昵称');
  const unknown=await f.call('profile',{nickname:'伪造',username:'伪造'});assert.equal(unknown.status,401);
  assert.equal(validateUsername(' 草籽_01 '),'草籽_01');for(const bad of ['', 'a'.repeat(25),'two words','bad/name','\u202e假名'])assert.throws(()=>validateUsername(bad));
 }finally{f.db.close();}
});
test('registry adapter sends only a name digest and account ID, verifies P-256 signatures and fails closed on service outages',async()=>{
 const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(await usernameSigningScalar(secret));const point=ecdh.getPublicKey(),publicKey={kty:'EC',crv:'P-256',x:base64url(point.subarray(1,33)),y:base64url(point.subarray(33))};
 const verifier=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);let received;
 const registry=createUsernameRegistry({secret,publicKey:JSON.stringify(publicKey),url:'https://yr-ladder-observatory.deep-spoon-6795.chatgpt.site/api/member-names',fetcher:async(url,init)=>{
  received=init;assert.ok(!init.body.includes(secret));assert.ok(!init.body.includes('用户名'));const data=JSON.parse(init.body);assert.equal(data.nameHash.length,64);
  const sig=Buffer.from(init.headers['X-Registry-Signature'],'base64url');assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verifier,sig,new TextEncoder().encode(init.headers['X-Registry-Time']+'\n'+init.body)),true);
  return Response.json({accountId:'YR-'+'1'.repeat(24)});
 }});
 assert.equal(await registry.claim('用户名','YR-'+'1'.repeat(24)),'YR-'+'1'.repeat(24));assert.ok(received.signal);
 const down=createUsernameRegistry({secret,publicKey:JSON.stringify(publicKey),url:'https://yr-ladder-observatory.deep-spoon-6795.chatgpt.site/api/member-names',fetcher:async()=>{throw Error('Unavailable');}});await assert.rejects(()=>down.lookup('用户名'),e=>e.status===503);
 assert.equal(createUsernameRegistry({secret,publicKey:JSON.stringify(publicKey),url:'https://untrusted.example'}),null);
});
