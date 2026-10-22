import {sponsorError,sponsorIdentity} from '../shared/lib/sponsors.mjs';
import {validateEvent,validateEntry,eventPhase,publicEvent,eventEntryIdentity} from '../shared/lib/events.mjs';
const ID=/^\d{13}_[a-f0-9]{64}$/,HEX=/^[a-f0-9]{64}$/;
export async function handleEvents({request,url,configured,store,get,set,list,sign,digest,equal,owner,requireOwner,rate,body,token,validToken,now,json,account}){
 const action=url.searchParams.get('action')||'list';
 const state=id=>get('event-states/'+id+'.json');
 const count=async id=>{const r=await store.list({prefix:'event-entries/'+id+'/',limit:5000,paginate:true,consistency:'strong'});return {count:new Set(r.blobs.map(b=>b.key.split('/').at(-1).split('_')[0])).size,lowerBound:!!r.cursor};};
 const read=async(id,privileged=false)=>{if(!ID.test(id||''))throw sponsorError('赛事编号不正确');const row=await get('events/'+id+'.json'),s=row?await state(id):null;if(!row||!privileged&&s?.status!=='approved')throw sponsorError('未找到公开赛事',404);return {row,s};};
 const summary=async(row,s,privateView=false)=>({...publicEvent(row,s,await count(row.id),now()),...(privateView?{reason:s?.reason||'',version:s?.version||null}:{})});
 async function roster(id,cursor){
  const r=await list('event-entries/'+id+'/',cursor);const participants=[];
  for(let i=0;i<r.blobs.length;i+=4)participants.push(...await Promise.all(r.blobs.slice(i,i+4).map(async b=>{const v=await get(b.key);if(!v)return null;const {name,platformId,qq,contact,note,createdAt}=v;return {name,platformId,qq,contact,note,createdAt};})));
  return {participants:participants.filter(Boolean),cursor:r.cursor||null};
 }
 async function requireOrganizer(input){
  if(!ID.test(input.id||''))throw sponsorError('管理回执不正确',404);
  const {row,s}=await read(input.id,true);if(!(account&&row.ownerId===account.id)&&!(HEX.test(input.ticket||'')&&equal(row.ticketHash,await digest(input.ticket))))throw sponsorError('管理回执不正确',404);return {row,s};
 }
 if(request.method==='GET'){
  if(action==='mine'){
   if(!account)throw sponsorError('请先登录普通用户账号',401);const entries=[],items=[],page=await list('user-items/'+account.id+'/events/',url.searchParams.get('cursor'));
   for(const b of page.blobs){const id=b.key.split('/').at(-1).slice(0,-5),row=await get('events/'+id+'.json');if(row?.ownerId===account.id)items.push(await summary(row,await state(id),true));}
   const joins=await list('user-items/'+account.id+'/entries/',url.searchParams.get('entryCursor'));
   for(const b of joins.blobs){const ref=await get(b.key),entry=ref?await get('event-entries/'+ref.id+'/'+ref.entryId+'.json'):null;if(entry?.ownerId===account.id){const event=await get('events/'+ref.id+'.json');entries.push({id:ref.id,entryId:ref.entryId,title:event?.title||'赛事',name:entry.name,createdAt:entry.createdAt});}}
   return json({items,cursor:page.cursor||null,entries,entryCursor:joins.cursor||null});
  }
  if(action==='session')return json({configured,owner:await owner(request)});
  if(action==='challenge'){if(!configured)throw sponsorError('赛事申请暂未开放',503);return json({challenge:await token('event',now())});}
  if(action==='queue')await requireOwner(request);else if(action!=='list')throw sponsorError('接口不存在',404);
  const id=url.searchParams.get('id');if(id){const {row,s}=await read(id,action==='queue');return json({item:await summary(row,s,action==='queue'),...(action==='queue'?await roster(id,url.searchParams.get('cursor')):{})});}
  const cursor=url.searchParams.get('cursor')||'';if(cursor.length>1500)throw sponsorError('分页参数过长');const page=await list(action==='queue'?'events/':'event-public/',cursor,12),items=[];
  for(let i=0;i<page.blobs.length;i+=3){const rows=await Promise.all(page.blobs.slice(i,i+3).map(async b=>{const id=b.key.split('/').at(-1).slice(0,-5);if(!ID.test(id))return null;const row=await get('events/'+id+'.json');if(!row)return null;const s=await state(id);if(action!=='queue'&&s?.status!=='approved')return null;return summary(row,s,action==='queue');}));items.push(...rows.filter(Boolean));}
  return json({items,cursor:page.cursor||null});
 }
 if(!configured)throw sponsorError('赛事申请暂未开放',503);const input=await body(request);
 if(['create','join'].includes(action)&&!account)throw sponsorError('请先登录普通用户账号',401);
 if(action==='create'){
  const at=await validToken(input.challenge,'event',20*60000);if(at===null)throw sponsorError('申请验证已过期，请刷新验证后重试');if(now()-at<2000||input.website)throw sponsorError('请稍候再提交');if(!HEX.test(input.ticket||''))throw sponsorError('管理回执格式不正确');
  const event=validateEvent(input);if(Date.parse(event.closesAt)<=now())throw sponsorError('新赛事的报名截止时间须在将来');
  const {id,ticketHash}=await sponsorIdentity(event,input.ticket,input.challenge);const key='events/'+id+'.json';if(await get(key))return json({id,duplicate:true});await rate(request,'event-create',5,60);
  if(account)await set('user-items/'+account.id+'/events/'+id+'.json',{id});
  await set(key,{...event,id,createdAt:new Date(now()).toISOString(),ticketHash,...(account?{ownerId:account.id}:{})});return json({id,status:'pending'},201);
 }
 if(action==='manage'){
  const {row,s}=await requireOrganizer(input);if((input.cursor||'').length>1500)throw sponsorError('分页参数过长');return json({item:await summary(row,s,true),...await roster(row.id,input.cursor)});
 }
 if(action==='review'){
  await requireOwner(request);if(!['approved','rejected'].includes(input.status))throw sponsorError('审核状态不正确');const {row,s}=await read(input.id,true);if((input.version||null)!==(s?.version||null))throw sponsorError('该赛事已有新审核结果，请刷新后重试',409);
  const reason=typeof input.reason==='string'?input.reason.trim():'';if(reason.length>300||/[\u0000-\u001f]/.test(reason)||input.status==='rejected'&&!reason)throw sponsorError('驳回或撤回须填写原因（最多300字）');
  const at=Math.max(now(),s?Date.parse(s.at)+1:0),version=String(9999999999999-at).padStart(13,'0')+'_'+crypto.randomUUID(),next={status:input.status,reason,at:new Date(at).toISOString(),version};
  if(input.status==='approved')await set('event-public/'+row.id+'.json',{id:row.id});await set('event-reviews/'+row.id+'/'+version+'.json',next);await set('event-states/'+row.id+'.json',next);return json({item:await summary(row,next,true)});
 }
 if(action==='join'){
  const at=await validToken(input.challenge,'event',20*60000);if(at===null||now()-at<2000||input.website)throw sponsorError('报名验证已过期或未就绪，请刷新验证重试');if(!HEX.test(input.ticket||''))throw sponsorError('报名回执格式不正确');
  const {row,s}=await read(input.id);if(!eventPhase(row,now()).canJoin)throw sponsorError(eventPhase(row,now()).label+'，当前不能报名',409);
  const entry=validateEntry(input),{person,ticketHash,entryId}=await eventEntryIdentity(input.id,entry.platformId,input.ticket),key='event-entries/'+input.id+'/'+entryId+'.json';
  if(await get(key))return json({id:input.id,entryId,duplicate:true});
  const existing=await list('event-entries/'+input.id+'/'+person+'_',null,1);if(existing.blobs.length)throw sponsorError('该平台ID已报名，请勿重复报名',409);
  await rate(request,'event-join',10,10);const current=await state(input.id);if(current?.status!=='approved'||current.version!==s.version||!eventPhase(row,now()).canJoin)throw sponsorError('赛事状态已变化，请刷新后重试',409);
  if(account)await set('user-items/'+account.id+'/entries/'+entryId+'.json',{id:input.id,entryId});
  await set(key,{...entry,entryId,eventId:input.id,ticketHash,createdAt:new Date(now()).toISOString(),...(account?{ownerId:account.id}:{})});return json({id:input.id,entryId,registered:true},201);
 }
 if(action==='entry'){
  if(!ID.test(input.id||'')||typeof input.entryId!=='string'||!/^[a-f0-9]{64}_[a-f0-9]{64}$/.test(input.entryId))throw sponsorError('报名回执不正确',404);
  const entry=await get('event-entries/'+input.id+'/'+input.entryId+'.json');if(!entry||!(account&&entry.ownerId===account.id)&&!(HEX.test(input.ticket||'')&&equal(entry.ticketHash,await digest(input.ticket))))throw sponsorError('报名回执不正确',404);const {ticketHash,ownerId,...safe}=entry;return json({entry:safe});
 }
 throw sponsorError('接口不存在',404);
}
