import {digest,accountError} from '../shared/lib/accounts.mjs';
const ITEM=/^\d{13}_[a-f0-9]{64}$/,ENTRY=/^[a-f0-9]{64}_[a-f0-9]{64}$/;
const read=(store,key)=>store.get(key,{type:'json',consistency:'strong'});
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export async function memberNotifications({store,communityStore,accountId,kind='all',cursor=''}){
 if(!['all','events','sponsors','entries'].includes(kind)||typeof cursor!=='string'||cursor.length>1500||kind==='all'&&cursor)throw accountError('通知分页参数不正确');
 const items=[],cursors={};
 if(!communityStore)return {items,cursors};
 async function add(source,key,type,title,body,at,query,version=''){
  if(!validDate(at))return;
  const id=await digest([source,key,type,version].join('\n'));
  items.push({id,kind:source,type,title,body,createdAt:at,query,read:!!await read(store,'notice-read/'+accountId+'/'+id+'.json')});
 }
 for(const source of kind==='all'?['events','sponsors','entries']:[kind]){
  // Keep the header's first request small across all three source types.
  const page=await communityStore.list({prefix:'user-items/'+accountId+'/'+source+'/',cursor:cursor||undefined,limit:kind==='all'?3:6,paginate:false,consistency:'strong'});
  cursors[source]=page.cursor||null;
  for(let offset=0;offset<page.blobs.length;offset+=3)await Promise.all(page.blobs.slice(offset,offset+3).map(async b=>{
   const key=b.key.split('/').at(-1).replace(/\.json$/,'');
   if(source==='entries'){
    if(!ENTRY.test(key))return;const ref=await read(communityStore,b.key);if(!ITEM.test(ref?.id||'')||!ENTRY.test(ref?.entryId||''))return;
    const entry=await read(communityStore,'event-entries/'+ref.id+'/'+ref.entryId+'.json');if(entry?.ownerId!==accountId)return;
    const [event,state]=await Promise.all([read(communityStore,'events/'+ref.id+'.json'),read(communityStore,'event-states/'+ref.id+'.json')]);
    const title=event?.title||'赛事',query='screen=events&eventTab=mine';
    await add(source,key,'registered','报名成功：'+title,'已收到你的报名，可在“我的赛事”查询报名资料。',entry.createdAt,query);
    if(state&&validDate(state.at)&&Date.parse(state.at)>Date.parse(entry.createdAt))await add(source,key,'event-state',state.status==='rejected'?'赛事已撤回：'+title:'赛事已重新公开：'+title,state.status==='rejected'?'该赛事已撤回，请到我的赛事核对安排。':'该赛事已重新公开，请查看最新比赛安排。',state.at,query,state.version||state.at);
   }else{
    if(!ITEM.test(key))return;
    const row=await read(communityStore,(source==='events'?'events/':'applications/')+key+'.json');if(row?.ownerId!==accountId)return;
    const state=await read(communityStore,(source==='events'?'event-states/':'states/')+key+'.json'),title=source==='events'?row.title:row.playerA+' vs '+row.playerB,query=source==='events'?'screen=events&eventTab=mine':'screen=account';
    await add(source,key,'submitted','申请已提交：'+title,'已收到'+(source==='events'?'办赛申请':'赞助赛登记')+'，请等待站主审核。',row.createdAt,query);
    if(state&&['approved','rejected'].includes(state.status))await add(source,key,'review',state.status==='approved'?'审核通过：'+title:'未通过或已撤回：'+title,state.reason||(state.status==='approved'?'申请已审核通过并公开，可查看最新详情。':'申请未公开，请查看审核结果。'),state.at,query,state.version||state.at);
   }
  }));
 }
 return {items:items.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id)),cursors};
}
