import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createAccountsHandler} from '../src/accounts-api.mjs';
import {createSponsorsHandler} from '../src/sponsors-api.mjs';
import {digest} from '../shared/lib/accounts.mjs';
import {mergeSignupDefaults} from '../shared/lib/signup-defaults.mjs';
import {currentScreen,statsQuery} from '../shared/lib/navigation.mjs';
const now=1792731600000,secret='isolated-member-tools-secret-123456789';
const A='YR-111111111111111111111111',B='YR-222222222222222222222222';
function memory(){const values=new Map(),reads=[];return {values,reads,async get(key){reads.push(key);return structuredClone(values.get(key)||null);},async setJSON(key,value){values.set(key,structuredClone(value));},async list({prefix,cursor='',limit=30}){reads.push('list:'+prefix);const keys=[...values.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:null};}};}
async function seed(store,id,token){store.values.set('profiles/'+id+'.json',{id,nickname:'测试昵称',createdAt:new Date(now).toISOString(),avatarVersion:null});store.values.set('users/'+id+'.json',{id,version:'v1'});store.values.set('sessions/'+await digest(token)+'.json',{id,version:'v1',expiresAt:now+86400000});return 'yuri_member_session='+token;}
async function setup(){const store=memory(),community=memory(),a=await seed(store,A,'a'.repeat(64)),b=await seed(store,B,'b'.repeat(64)),handler=createAccountsHandler({store,communityStore:community,secret,now:()=>now});return {store,community,a,b,handler};}
const owner=(at=now)=>'yuri_site_owner=owner.'+at+'.'+createHmac('sha256',secret).update('owner.'+at).digest('hex');
async function call(handler,action,body,cookie='',params={},path='account'){
 const response=await handler(new Request('https://unit.test/api/'+path+'?'+new URLSearchParams({action,...params}),{method:body?'POST':'GET',headers:{Origin:'https://unit.test',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,data:await response.json(),headers:response.headers};
}
const id=n=>'8200000000000_'+String(n).padStart(64,'0'),date=n=>new Date(now+n*1000).toISOString();
function event(store,n,account=A){const key=id(n);store.values.set('events/'+key+'.json',{id:key,title:'测试赛事'+n,ownerId:account,createdAt:date(-100+n)});store.values.set('user-items/'+account+'/events/'+key+'.json',{id:key});return key;}

test('signup defaults are private, validated and scoped to the authenticated account',async()=>{
 const {store,community,a,b,handler}=await setup();
 assert.equal((await call(handler,'signup-profile')).status,401);assert.equal((await call(handler,'signup-profile',{name:'x'})).status,401);
 const saved=await call(handler,'signup-profile',{name:' 圈内昵称 ',platformName:' LBW玩家 ',qq:'123456789',id:B},a);assert.equal(saved.status,200);assert.deepEqual(saved.data.profile,{name:'圈内昵称',platformName:'LBW玩家',qq:'123456789'});
 assert.ok(store.values.has('signup-profiles/'+A+'.json'));assert.ok(!store.values.has('signup-profiles/'+B+'.json'));
 assert.equal((await call(handler,'signup-profile',undefined,a)).data.profile.qq,'123456789');assert.deepEqual((await call(handler,'signup-profile',undefined,b)).data.profile,{name:'',platformName:'',qq:''});
 assert.equal((await call(handler,'signup-profile',{qq:'01234'},a)).status,400);assert.equal((await call(handler,'signup-profile',{name:'bad\u202e'},a)).status,400);
 const publicProfile=await call(handler,'profile',undefined,'',{id:A});assert.ok(!JSON.stringify(publicProfile.data).includes('123456789'));assert.ok(!JSON.stringify(publicProfile.data).includes('platformName'));
 const directory=await call(handler,'admin-users',undefined,owner());assert.equal(directory.status,200);assert.ok(!JSON.stringify(directory.data).includes('123456789'));
 assert.equal(community.reads.length,0);assert.equal(saved.headers.get('Cache-Control'),'private, no-store');
 assert.deepEqual((await call(handler,'signup-profile',{},a)).data.profile,{name:'',platformName:'',qq:''});
});

test('notification feed backfills owned records without leaking contacts or trusting forged indexes',async()=>{
 const {store,community,a,b,handler}=await setup();const own=event(community,1),foreign=event(community,2,B);
 community.values.set('user-items/'+A+'/events/'+foreign+'.json',{id:foreign});
 community.values.set('event-states/'+own+'.json',{status:'approved',at:date(-30),version:'v1',reason:'规则已核对'});
 const sponsor=id(3);community.values.set('applications/'+sponsor+'.json',{id:sponsor,ownerId:A,playerA:'选手甲',playerB:'选手乙',createdAt:date(-50),ticketHash:'private-ticket'});community.values.set('user-items/'+A+'/sponsors/'+sponsor+'.json',{id:sponsor});
 const entryId='c'.repeat(64)+'_'+'d'.repeat(64);community.values.set('event-entries/'+own+'/'+entryId+'.json',{ownerId:A,name:'报名昵称',qq:'987654321',ticketHash:'private-entry-ticket',createdAt:date(-20)});community.values.set('user-items/'+A+'/entries/'+entryId+'.json',{id:own,entryId});
 assert.equal((await call(handler,'notifications')).status,401);assert.equal(community.reads.length,0);
 const feed=await call(handler,'notifications',undefined,a);assert.equal(feed.status,200);assert.equal(feed.data.items.length,4);assert.ok(feed.data.items.some(n=>n.type==='registered'));assert.ok(feed.data.items.some(n=>n.body==='规则已核对'));
 const payload=JSON.stringify(feed.data);for(const value of ['987654321','private-ticket','private-entry-ticket','测试赛事2'])assert.ok(!payload.includes(value));
 const foreignFeed=await call(handler,'notifications',undefined,b);assert.equal(foreignFeed.data.items.length,1);assert.ok(!foreignFeed.data.items.some(n=>feed.data.items.some(v=>v.id===n.id)));
 assert.equal((await call(handler,'notifications',undefined,a,{kind:'../profiles'})).status,400);assert.equal((await call(handler,'notifications',undefined,a,{kind:'all',cursor:'invalid'})).status,400);
 assert.equal(store.reads.filter(k=>k.startsWith('signup-profiles/')).length,0);
});

test('read receipts are per-user and per-version; concurrent marks do not hide new reviews',async()=>{
 const {store,community,a,b,handler}=await setup(),key=event(community,1);community.values.set('event-states/'+key+'.json',{status:'approved',at:date(-20),version:'v1'});
 let notices=(await call(handler,'notifications',undefined,a)).data.items;const review=notices.find(n=>n.type==='review'),submission=notices.find(n=>n.type==='submitted');
 assert.equal((await call(handler,'notice-read',{ids:[review.id]},b)).status,200);assert.equal((await call(handler,'notifications',undefined,a)).data.items.find(n=>n.id===review.id).read,false);
 await Promise.all([call(handler,'notice-read',{ids:[review.id]},a),call(handler,'notice-read',{ids:[submission.id]},a)]);assert.ok((await call(handler,'notifications',undefined,a)).data.items.every(n=>n.read));
 community.values.set('event-states/'+key+'.json',{status:'rejected',at:date(-10),version:'v2',reason:'请调整时间'});notices=(await call(handler,'notifications',undefined,a)).data.items;const changed=notices.find(n=>n.type==='review');assert.notEqual(changed.id,review.id);assert.equal(changed.read,false);assert.equal(changed.body,'请调整时间');
 assert.equal((await call(handler,'notice-read',{ids:['../other']},a)).status,400);assert.equal((await call(handler,'notice-read',{ids:Array(51).fill(review.id)},a)).status,400);assert.equal((await call(handler,'notice-read',{ids:[review.id]})).status,401);
 assert.ok([...store.values.keys()].filter(k=>k.startsWith('notice-read/')).every(k=>/^notice-read\/YR-[A-F0-9]{24}\/[a-f0-9]{64}\.json$/.test(k)));
});

test('notifications page by owned source and keep unique identities across pages',async()=>{
 const {community,a,handler}=await setup();for(let n=0;n<8;n++)event(community,n);
 const page1=(await call(handler,'notifications',undefined,a,{kind:'events'})).data;assert.equal(page1.items.length,6);assert.ok(page1.cursors.events);
 const page2=(await call(handler,'notifications',undefined,a,{kind:'events',cursor:page1.cursors.events})).data;assert.equal(page2.items.length,2);assert.equal(page2.cursors.events,null);assert.equal(new Set([...page1.items,...page2.items].map(n=>n.id)).size,8);
});

test('admin summary requires owner session, limits coverage and leaves private account records unread',async()=>{
 const {store,community,a}=await setup(),handler=createSponsorsHandler({store:community,accountsStore:store,secret,now:()=>now});
 assert.equal((await call(handler,'admin-summary',undefined,'',{},'sponsors')).status,401);assert.equal((await call(handler,'admin-summary',undefined,a,{},'sponsors')).status,401);assert.equal((await call(handler,'admin-summary',undefined,owner(now-8*3600000-1),{},'sponsors')).status,401);
 for(let n=0;n<101;n++)event(community,n);community.values.set('event-states/'+id(0)+'.json',{status:'approved'});community.values.set('event-states/'+id(1)+'.json',{status:'rejected'});
 const result=await call(handler,'admin-summary',undefined,owner(),{},'sponsors');assert.equal(result.status,200);assert.deepEqual(result.data.events,{pending:98,approved:1,rejected:1,scanned:100,hasMore:true});assert.equal(result.data.sponsors.scanned,0);assert.equal(result.data.scope,'每类最近100条申请');
 assert.ok(!store.reads.some(k=>k.startsWith('signup-profiles/')||k.startsWith('users/')));
});

test('late defaults preserve manual edits and community navigation never changes stats filters',()=>{
 const profile={name:'常用昵称',platformName:'平台昵称',qq:'12345678'},manual={name:'临时昵称',platformName:'',qq:'87654321',note:'本次备注'};
 assert.deepEqual(mergeSignupDefaults(manual,profile),{...manual,platformName:'平台昵称'});assert.equal(mergeSignupDefaults({name:'',platformName:'',qq:''},{name:'',platformName:'',qq:''},'展示昵称').name,'展示昵称');
 assert.equal(currentScreen(new URLSearchParams('screen=admin&adminTab=events')),'admin');assert.equal(statsQuery('screen=admin&adminTab=users&eventPhase=open&accountTab=notifications&season=31'),'season=31');
});
