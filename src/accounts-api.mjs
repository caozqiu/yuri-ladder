import {ACCOUNT_ID,HEX_KEY,ACCOUNT_COOKIE,accountError,randomKey,digest,equal,normalizeAccount,accountId,validateNickname,validatePassword,profileView,validateAvatar} from '../shared/lib/accounts.mjs';
import {hashPassword,verifyPassword,DUMMY_HASH} from './passwords.mjs';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff',...headers}});
const get=(store,key)=>store.get(key,{type:'json',consistency:'strong'});
const set=(store,key,value)=>store.setJSON(key,value,{cacheControl:'no-store'});
function cookieToken(request){const raw=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(ACCOUNT_COOKIE+'='))?.slice(ACCOUNT_COOKIE.length+1);return HEX_KEY.test(raw||'')?raw:null;}
export async function currentAccount(request,store,now=Date.now()){
 if(!store)return null;const value=cookieToken(request);if(!value)return null;
 const session=await get(store,'sessions/'+await digest(value)+'.json');if(!session||session.revoked||session.expiresAt<=now)return null;
 const record=await get(store,'users/'+session.id+'.json');if(!record||record.version!==session.version)return null;
 const profile=await get(store,'profiles/'+record.id+'.json');return profile?{...profileView(profile),version:record.version}:null;
}
export function createAccountsHandler({store,secret,now=Date.now}){
 const configured=typeof secret==='string'&&secret.length>=24;
 const hmac=async value=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');};
 const sessionCookie=(request,value,age)=>ACCOUNT_COOKIE+'='+value+'; Path=/api; HttpOnly; SameSite=Strict; Max-Age='+age+(new URL(request.url).protocol==='https:'?'; Secure':'');
 async function login(request,record,extra={},status=200){const token=randomKey();await set(store,'sessions/'+await digest(token)+'.json',{id:record.id,version:record.version,expiresAt:now()+30*86400000});const profile=await get(store,'profiles/'+record.id+'.json');return json({user:profileView(profile),...extra},status,{'Set-Cookie':sessionCookie(request,token,30*86400)});}
 async function rate(request,kind,limit,minutes,subject=''){
  const ip=request.eo?.clientIp||request.headers.get('eo-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  for(const identity of [ip,...(subject?[subject]:[])]){const key='limits/'+kind+'_'+Math.floor(now()/(minutes*60000))+'_'+(await hmac(identity)).slice(0,32)+'.json';const n=(await get(store,key))?.count||0;if(n>=limit)throw accountError('操作过于频繁，请稍后再试',429);await set(store,key,{count:n+1});}
 }
 async function readBody(request){if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountError('请在本站页面操作',403);if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw accountError('请使用JSON提交',415);if(Number(request.headers.get('Content-Length')||0)>370000)throw accountError('提交内容过长',413);let data;try{data=await request.json();}catch{throw accountError('提交内容格式不正确');}if(!data||typeof data!=='object'||Array.isArray(data)||new TextEncoder().encode(JSON.stringify(data)).length>370000)throw accountError('提交内容不正确或过长',413);return data;}
 async function requireUser(request){const user=await currentAccount(request,store,now());if(!user)throw accountError('请先登录普通用户账号',401);return user;}
 return async request=>{try{
  const url=new URL(request.url),action=url.searchParams.get('action')||'session';
  if(!['GET','POST'].includes(request.method))return json({error:'请求方法不支持'},405,{Allow:'GET, POST'});
  if(request.method==='GET'){
   if(action==='admin-users'){
    const raw=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('yuri_site_owner='))?.slice('yuri_site_owner='.length)||'';
    const [kind,time,signature,...rest]=raw.split('.'),at=Number(time);
    if(!configured||rest.length||kind!=='owner'||!Number.isSafeInteger(at)||at>now()+1000||now()-at>8*3600000||!equal(signature||'',await hmac(kind+'.'+time)))throw accountError('请先登录站主审核后台',401);
    const cursor=url.searchParams.get('cursor')||'';if(cursor.length>1500)throw accountError('分页参数过长');
    const page=await store.list({prefix:'profiles/',cursor:cursor||undefined,limit:25,paginate:false,consistency:'strong'}),items=[];
    for(let i=0;i<page.blobs.length;i+=4)items.push(...(await Promise.all(page.blobs.slice(i,i+4).map(async b=>{const p=await get(store,b.key);if(!p||!ACCOUNT_ID.test(p.id||''))return null;return {...profileView(p),...(typeof p.username==='string'?{username:p.username}:{})};}))).filter(Boolean));
    return json({items,cursor:page.cursor||null});
   }
   if(action==='session'){const user=await currentAccount(request,store,now());return json({configured,user:user?{id:user.id,nickname:user.nickname,avatar:user.avatar,createdAt:user.createdAt}:null});}
   if(action==='challenge'){if(!configured)throw accountError('账号注册暂未开放',503);const at=now();return json({challenge:at+'.'+await hmac('register.'+at)});}
   if(action==='profile'||action==='avatar'){
    const id=url.searchParams.get('id');if(!ACCOUNT_ID.test(id||''))throw accountError('未找到用户',404);const profile=await get(store,'profiles/'+id+'.json');if(!profile)throw accountError('未找到用户',404);
    if(action==='profile')return json({user:profileView(profile)});
    if(!profile.avatarVersion)throw accountError('暂无头像',404);const avatar=await get(store,'avatars/'+id+'/'+profile.avatarVersion+'.json');if(!avatar||avatar.version!==profile.avatarVersion)throw accountError('暂无头像',404);
    return new Response(Uint8Array.from(atob(avatar.data),c=>c.charCodeAt(0)),{headers:{'Content-Type':avatar.type,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
   }
   throw accountError('接口不存在',404);
  }
  if(!configured)throw accountError('账号服务暂未开放',503);const input=await readBody(request);
  if(action==='register'){
   const [time,signature,...rest]=String(input.challenge||'').split('.'),at=Number(time);if(rest.length||!Number.isSafeInteger(at)||now()-at<2000||now()-at>20*60000||!equal(signature,await hmac('register.'+time))||input.website)throw accountError('注册验证未就绪或已过期，请刷新重试');
   const nickname=validateNickname(input.nickname),password=validatePassword(input.password);if(!HEX_KEY.test(input.registrationKey||''))throw accountError('注册恢复码格式不正确');await rate(request,'register',5,60);
   const id=await accountId(input.registrationKey),key='users/'+id+'.json',recoveryHash=await digest(input.registrationKey),existing=await get(store,key);
   if(existing){if(!equal(existing.recoveryHash,recoveryHash))throw accountError('注册编号冲突，请重新生成恢复码',409);return login(request,existing,{duplicate:true});}
   const createdAt=new Date(now()).toISOString(),record={id,passwordAlgorithm:'bcrypt-10',passwordHash:await hashPassword(password),recoveryHash,version:randomKey(16),createdAt};
   await set(store,'profiles/'+id+'.json',{id,nickname,createdAt,avatarVersion:null});await set(store,key,record);return login(request,record,{registered:true},201);
  }
  if(action==='login'){
   const id=normalizeAccount(input.id);if(!ACCOUNT_ID.test(id)||typeof input.password!=='string'||input.password.length>128)throw accountError('账号或密码不正确',401);
   await rate(request,'login',12,15,id);const record=await get(store,'users/'+id+'.json');const valid=await verifyPassword(input.password,record?.passwordHash||DUMMY_HASH);if(!record||!valid)throw accountError('账号或密码不正确',401);return login(request,record);
  }
  if(action==='logout'){const token=cookieToken(request);if(token&&await currentAccount(request,store,now()))await set(store,'sessions/'+await digest(token)+'.json',{revoked:true});return json({user:null},200,{'Set-Cookie':sessionCookie(request,'',0)});}
  if(action==='recover'){
   const id=normalizeAccount(input.id),password=validatePassword(input.newPassword);if(!ACCOUNT_ID.test(id)||!HEX_KEY.test(input.recoveryKey||''))throw accountError('账号或恢复码不正确',401);await rate(request,'recover',5,60,id);
   const record=await get(store,'users/'+id+'.json');if(!record||!equal(record.recoveryHash,await digest(input.recoveryKey)))throw accountError('账号或恢复码不正确',401);
   const next={...record,passwordAlgorithm:'bcrypt-10',passwordHash:await hashPassword(password),version:randomKey(16)};delete next.salt;await set(store,'users/'+id+'.json',next);return login(request,next,{recovered:true});
  }
  const user=await requireUser(request);
  if(action==='profile'){
   await rate(request,'profile',20,10,user.id);const profile=await get(store,'profiles/'+user.id+'.json');const nickname=validateNickname(input.nickname);let avatarVersion=profile.avatarVersion;
   if(input.avatar!==undefined){if(input.avatar===null)avatarVersion=null;else{const avatar=validateAvatar(input.avatar);avatarVersion=(await digest(avatar.data)).slice(0,24);await set(store,'avatars/'+user.id+'/'+avatarVersion+'.json',{...avatar,version:avatarVersion});}}
   const next={...profile,nickname,avatarVersion};await set(store,'profiles/'+user.id+'.json',next);return json({user:profileView(next)});
  }
  if(action==='password'){
   const password=validatePassword(input.newPassword);if(typeof input.oldPassword!=='string'||input.oldPassword.length>128)throw accountError('原密码不正确',401);await rate(request,'password',8,15,user.id);
   const record=await get(store,'users/'+user.id+'.json');if(!await verifyPassword(input.oldPassword,record.passwordHash))throw accountError('原密码不正确',401);const next={...record,passwordAlgorithm:'bcrypt-10',passwordHash:await hashPassword(password),version:randomKey(16)};delete next.salt;await set(store,'users/'+user.id+'.json',next);return login(request,next,{passwordChanged:true});
  }
  throw accountError('接口不存在',404);
 }catch(error){return json({error:error.status?error.message:'账号服务暂时不可用，请稍后重试',...(error.status===503||!error.status?{code:typeof error.code==='string'?error.code:'ACCOUNT_SERVICE'}:{})},error.status||503);}};
}
