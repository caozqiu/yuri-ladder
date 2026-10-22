import {validateSponsor,publicSponsor,sponsorError,sponsorIdentity} from '../shared/lib/sponsors.mjs';
import {fetchSponsorMatch,PLATFORM_ID,MATCH_ID,proofValue} from '../shared/lib/sponsor-source.mjs';
import {handleEvents} from './events-api.mjs';
import {currentAccount} from './accounts-api.mjs';
const utf8=new TextEncoder(),COOKIE='yuri_site_owner',ID=/^\d{13}_[a-f0-9]{64}$/;
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie',...extra}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',utf8.encode(s)));
const equal=(a,b)=>{let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;};
const inverse=n=>String(9999999999999-n).padStart(13,'0');
export function createSponsorsHandler({store,secret,now=Date.now,sourceMatch=fetchSponsorMatch,accountsStore}){
 const configured=typeof secret==='string'&&secret.length>=24;
 const sign=async value=>{const key=await crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,utf8.encode(value)));};
 const token=async(kind,at)=>kind+'.'+at+'.'+await sign(kind+'.'+at);
 const validToken=async(value,kind,ttl)=>{if(typeof value!=='string'||value.length>200)return null;const [k,t,s]=value.split('.'),at=Number(t);if(k!==kind||!Number.isSafeInteger(at)||at>now()+1000||now()-at>ttl||!equal(s||'',await sign(k+'.'+t)))return null;return at;};
 const get=key=>store.get(key,{type:'json',consistency:'strong'});
 const set=(key,data)=>store.setJSON(key,data,{cacheControl:'no-store'});
 const list=(prefix,cursor,limit=30)=>store.list({prefix,cursor:cursor||undefined,limit,paginate:false,consistency:'strong'});
 // Object listings may lag behind a write. A strong point read is the
 // authoritative moderation state; immutable review objects are audit records.
 const latest=id=>get('states/'+id+'.json');
 const cookie=(request,value,age)=>COOKIE+'='+value+'; Path=/api; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(request.url).protocol==='https:'?'; Secure':'');
 const owner=async request=>{
  if(!configured)return false;
  const value=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return await validToken(value,'owner',8*3600000)!==null;
 };
 const requireOwner=async request=>{if(!await owner(request))throw sponsorError('请先登录站主审核账号',401);};
 const rate=async(request,kind,max,minutes)=>{
  // Persistent, best-effort abuse throttling; not a distributed lock.
  const ip=request.eo?.clientIp||request.headers.get('eo-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const slot=Math.floor(now()/(minutes*60000));const key='limits/'+kind+'_'+slot+'_'+(await sign(String(ip))).slice(0,32)+'.json';
  const count=(await get(key))?.count||0;if(count>=max)throw sponsorError('操作过于频繁，请稍后再试',429);await set(key,{count:count+1});
 };
 async function body(request){
  const origin=request.headers.get('Origin'),url=new URL(request.url);
  if(origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw sponsorError('请在本站页面操作',403);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw sponsorError('请使用JSON提交',415);
  if(Number(request.headers.get('Content-Length')||0)>24576)throw sponsorError('申请内容过长',413);
  // Use the platform's native JSON reader, rather than its raw stream adapter.
  // EdgeOne caps uploads at 1 MiB; additionally limit both declared upload size
  // and the parsed application to 24 KiB before validation or storage.
  let parsed;try{parsed=await request.json();}catch{throw sponsorError('提交内容格式不正确');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw sponsorError('提交内容须为JSON对象');
  if(utf8.encode(JSON.stringify(parsed)).byteLength>24576)throw sponsorError('申请内容过长',413);return parsed;
 }
 return async function handle(request){
  try{
   const url=new URL(request.url),action=url.searchParams.get('action')||'list';
   const account=await currentAccount(request,accountsStore,now());
   if(!['GET','POST'].includes(request.method))return json({error:'请求方法不支持'},405,{Allow:'GET, POST'});
   if(url.pathname==='/api/events')return await handleEvents({request,url,configured,store,get,set,list,sign,digest,equal,owner,requireOwner,rate,body,token,validToken,now,json,account});
   if(request.method==='GET'){
    if(action==='mine'){
     if(!account)throw sponsorError('请先登录普通用户账号',401);const page=await list('user-items/'+account.id+'/sponsors/',url.searchParams.get('cursor'));const items=[];
     for(const b of page.blobs){const id=b.key.split('/').at(-1).slice(0,-5),row=await get('applications/'+id+'.json');if(row?.ownerId===account.id){const review=await latest(id);items.push({...publicSponsor(row,review),reason:review?.reason||''});}}
     return json({items,cursor:page.cursor||null});
    }
    if(action==='session')return json({configured,owner:await owner(request)});
    if(action==='challenge'){
     if(!configured)throw sponsorError('赞助赛申请暂未开放，请稍后再试',503);
     return json({challenge:await token('apply',now()),minDelay:2});
    }
    if(action==='queue')await requireOwner(request);
    else if(action!=='list')throw sponsorError('接口不存在',404);
    const id=url.searchParams.get('id');if(id&&!ID.test(id))throw sponsorError('申请编号格式不正确');
    if(id){const row=await get('applications/'+id+'.json'),review=row?await latest(id):null;if(!row||(action!=='queue'&&review?.status!=='approved'))throw sponsorError('未找到公开赛事',404);return json({item:{...publicSponsor(row,review),...(action==='queue'?{reason:review?.reason||'',version:review?.version||null}:{})}});}
    const cursor=url.searchParams.get('cursor')||'';if(cursor.length>1500)throw sponsorError('分页参数过长');
    const page=await list(action==='queue'?'applications/':'published/',cursor);
    const items=[];
    // Bounded batches avoid flooding the storage service when a page is full.
    for(let i=0;i<page.blobs.length;i+=4){const rows=await Promise.all(page.blobs.slice(i,i+4).map(async({key})=>{
     const id=key.slice(key.indexOf('/')+1,-5);if(!ID.test(id))return null;
     const row=await get('applications/'+id+'.json');if(!row)return null;const review=await latest(id);
     if(action!=='queue'&&review?.status!=='approved')return null;
     return {...publicSponsor(row,review),...(action==='queue'?{reason:review?.reason||'',version:review?.version||null}:{})};
    }));items.push(...rows.filter(Boolean));}
    return json({items,cursor:page.cursor||null});
   }
   if(!configured)throw sponsorError('赞助赛申请暂未开放，请稍后再试',503);
   const input=await body(request);
   if(action==='login'){
    await rate(request,'login',8,15);
    if(typeof input.password!=='string'||input.password.length>256||!equal(await digest(input.password),await digest(secret)))throw sponsorError('审核密码不正确',401);
    return json({owner:true},200,{'Set-Cookie':cookie(request,await token('owner',now()),28800)});
   }
   if(action==='logout')return json({owner:false},200,{'Set-Cookie':cookie(request,'',0)});
   if(['submit','import'].includes(action)&&!account)throw sponsorError('请先登录普通用户账号',401);
   if(action==='import'){
    if(![input.platformA,input.platformB,input.matchId].every(v=>typeof v==='string')||!PLATFORM_ID.test(input.platformA)||!PLATFORM_ID.test(input.platformB)||input.platformA===input.platformB||!MATCH_ID.test(input.matchId))throw sponsorError('请填写双方不同的平台数字ID及有效对局编号');
    await rate(request,'import',60,10);
    const result=await sourceMatch(input.matchId,input.platformA,input.platformB);
    return json({...result,round:{...result.round,proof:await sign('source.'+proofValue(result.round,input.platformA,input.platformB))}});
   }
   if(action==='submit'){
    const at=await validToken(input.challenge,'apply',20*60000);
    if(at===null)throw sponsorError('申请页面已过期，请刷新验证后重试');
    if(now()-at<2000||input.website)throw sponsorError('请稍候再提交申请');
    if(typeof input.ticket!=='string'||!/^[a-f0-9]{64}$/.test(input.ticket))throw sponsorError('申请回执格式不正确');
    const data=validateSponsor(input);const {ticketHash,id}=await sponsorIdentity(data,input.ticket,input.challenge);
    for(const round of data.rounds)if(round.matchId&&!equal(round.proof,await sign('source.'+proofValue(round,data.platformA,data.platformB))))throw sponsorError('已导入对局被更改或选手绑定已变化，请删除后重新导入');
    const key='applications/'+id+'.json',existing=await get(key);
    if(existing)return json({id,status:(await latest(id))?.status||'pending',duplicate:true});
    await rate(request,'submit',5,10);
    const record={id,...data,createdAt:new Date(now()).toISOString(),ticketHash,...(account?{ownerId:account.id}:{})};
    if(account)await set('user-items/'+account.id+'/sponsors/'+id+'.json',{id});
    await set(key,record);return json({id,status:'pending'},201);
   }
   if(action==='receipt'){
    if(!ID.test(input.id||''))throw sponsorError('回执不正确',404);
    const row=await get('applications/'+input.id+'.json');if(!row||!(account&&row.ownerId===account.id)&&!(typeof input.ticket==='string'&&/^[a-f0-9]{64}$/.test(input.ticket)&&equal(row.ticketHash,await digest(input.ticket))))throw sponsorError('回执不正确',404);
    const review=await latest(input.id);return json({item:{...publicSponsor(row,review),reason:review?.reason||''}});
   }
   if(action==='review'){
    await requireOwner(request);
    if(!ID.test(input.id||'')||!['approved','rejected'].includes(input.status))throw sponsorError('审核参数不正确');
    const row=await get('applications/'+input.id+'.json');if(!row)throw sponsorError('未找到申请',404);
    const previous=await latest(input.id);if((input.version||null)!==(previous?.version||null))throw sponsorError('该申请已有新的审核结果，请刷新后再操作',409);
    const reason=typeof input.reason==='string'?input.reason.trim():'';if(reason.length>300||/[\u0000-\u001f]/.test(reason))throw sponsorError('审核说明最多300字，请勿换行');
    if(input.status==='rejected'&&!reason)throw sponsorError('请填写未通过或撤回原因');
    const at=Math.max(now(),previous?Date.parse(previous.at)+1:0),version=inverse(at)+'_'+crypto.randomUUID();
    // The publication pointer is not an approval. Every public read checks
    // the latest immutable review, so a failed operation never exposes a pending item.
    if(input.status==='approved')await set('published/'+input.id+'.json',{id:input.id});
    const review={status:input.status,at:new Date(at).toISOString(),version,reason};
    await set('reviews/'+input.id+'/'+version+'.json',review);
    await set('states/'+input.id+'.json',review);
    return json({item:{...publicSponsor(row,review),reason,version}});
   }
   throw sponsorError('接口不存在',404);
  }catch(error){return json({error:error.status?error.message:'暂时无法连接赞助赛存储，请稍后重试'},error.status||503);}
 };
}
