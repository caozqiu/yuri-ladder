import test from 'node:test';
import assert from 'node:assert/strict';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {fixtureMember} from './fixtures/member.mjs';
import {validateEntry} from '../shared/lib/events.mjs';
import {communityReturnQuery,communityReturnUpdate,eventRegistrationUrl} from '../shared/lib/community-navigation.mjs';
import {statsQuery} from '../shared/lib/navigation.mjs';
const id='8200000000000_'+'a'.repeat(64);
test('shared signup links contain only public event navigation and survive login without receipts or external redirects',()=>{
 const url=new URL(eventRegistrationUrl('https://yuri-ladder.cn/?eventTab=review&ticket=secret#private',id));
 assert.equal(url.origin,'https://yuri-ladder.cn');assert.equal(url.pathname,'/');assert.equal(url.hash,'');assert.deepEqual([...url.searchParams.keys()],['screen','eventId','eventAction']);assert.equal(url.searchParams.get('eventAction'),'join');
 const q=communityReturnQuery(url.search+'&ticket=private&owner=true&returnTo=https://evil.test');assert.equal(q,url.search.slice(1));assert.equal(communityReturnUpdate(q).eventId,id);assert.equal(communityReturnUpdate(q).returnTo,null);
 assert.equal(communityReturnUpdate('https://evil.test'),null);assert.equal(communityReturnQuery('screen=account&returnTo=evil'),'');assert.equal(communityReturnQuery('screen=events&eventTab=review'),'screen=events');assert.throws(()=>eventRegistrationUrl(url.origin,'bad'));
 assert.equal(communityReturnUpdate('screen=sponsors&sponsorTab=apply&ticket=private').sponsorTab,'apply');
 assert.equal(statsQuery('season=31&eventAction=join&returnTo=screen%3Devents'),statsQuery('season=31'));
});
test('anonymous, forged, expired or revoked member sessions cannot create events, sign up, submit sponsors or import games',async()=>{
 let now=Date.parse('2026-10-22T12:00:00Z');const member=fixtureMember(()=>now);await member.ready;const values=new Map();let imported=0;
 const store={async get(k){return values.get(k)||null;},async setJSON(k,v){values.set(k,v);},async list(){return {blobs:[]};}};
 const handler=createSponsorsHandler({store,accountsStore:member.store,secret:'community-access-isolated-owner-password',now:()=>now,sourceMatch:()=>{imported++;throw Error('must not call source');}});
 async function call(path,action,cookie=''){return handler(new Request('https://test.invalid/api/'+path+'?action='+action,{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json',Cookie:cookie},body:'{}'}));}
 for(const cookie of ['',member.cookie+'forged','yuri_site_owner=untrusted'])for(const [path,action]of [['events','create'],['events','join'],['sponsors','submit'],['sponsors','import']])assert.equal((await call(path,action,cookie)).status,401);
 assert.equal(values.size,0);assert.equal(imported,0);
 now+=31*86400000;assert.equal((await call('events','join',member.cookie)).status,401);
 now-=31*86400000;member.values.delete('users/'+member.id+'.json');assert.equal((await call('sponsors','submit',member.cookie)).status,401);assert.equal(values.size,0);
});
test('an owner review login alone does not permit member submissions and public viewing stays available',async()=>{
 const handler=createSponsorsHandler({store:{async get(){return null;},async setJSON(){},async list(){return {blobs:[]};}},secret:'community-access-isolated-owner-password'});
 const login=await handler(new Request('https://test.invalid/api/sponsors?action=login',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({password:'community-access-isolated-owner-password'})}));assert.equal(login.status,200);
 const cookie=login.headers.get('Set-Cookie').split(';')[0];
 for(const [path,action]of [['events','create'],['events','join'],['sponsors','submit'],['sponsors','import']])assert.equal((await handler(new Request('https://test.invalid/api/'+path+'?action='+action,{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json',Cookie:cookie},body:'{}'}))).status,401);
 for(const path of ['events','sponsors'])assert.equal((await handler(new Request('https://test.invalid/api/'+path+'?action=list'))).status,200);
});
test('signup requires a nickname, string platform ID and a private QQ number; invalid or missing fields are rejected',()=>{
 const entry={name:'参赛昵称',platformId:'9223372036854775807',qq:'123456789',note:'选填备注'};assert.equal(validateEntry(entry).qq,entry.qq);assert.equal(validateEntry(entry).platformId,entry.platformId);
 for(const changes of [{name:''},{platformId:''},{platformId:123456},{qq:undefined},{qq:''},{qq:'abc123'},{qq:'012345'},{qq:'1234'},{qq:'1'.repeat(13)}])assert.throws(()=>validateEntry({...entry,...changes}));
 for(const qq of ['12345','123456789012'])assert.equal(validateEntry({...entry,qq}).qq,qq);
});
