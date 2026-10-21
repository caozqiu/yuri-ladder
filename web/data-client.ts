import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
let manifest:any=null,manifestAt=0,pending:Promise<any>|null=null;
const snapshots=new Map<string,Promise<any>>();
async function getManifest(force=false){
  if(manifest&&!force&&Date.now()-manifestAt<60000)return manifest;
  if(!pending)pending=fetch('/data/index.json',{cache:'no-cache'}).then(async r=>{
    if(!r.ok)throw new Error('暂时无法读取完整数据');
    const data=await r.json();manifest=data;manifestAt=Date.now();return data;
  }).finally(()=>{pending=null;});
  return pending;
}
async function load(entry:any){
  if(!snapshots.has(entry.snapshot)){
    const promise=fetch(entry.file).then(async r=>{
      if(!r.ok)throw new Error('数据已更新，请刷新页面后重试');
      const data=await r.json();
      if(data.snapshot!==entry.snapshot)throw new Error('数据批次不一致');
      return data;
    }).catch(e=>{snapshots.delete(entry.snapshot);throw e;});
    snapshots.set(entry.snapshot,promise);
    if(snapshots.size>8)snapshots.delete(snapshots.keys().next().value!);
  }
  return snapshots.get(entry.snapshot)!;
}
export async function siteFetch(input:string,init:RequestInit={}){
  const signal=init.signal;signal?.throwIfAborted();
  const url=new URL(input,window.location.origin);
  const method=(init.method||'GET').toUpperCase();
  if(!['GET','HEAD'].includes(method))return Response.json({error:'只读接口'},{status:405});
  // Each view uses one complete, immutable dataset. Shared downloads are never
  // cancelled when another view aborts its own request.
  const operation=(async()=>{
    const index=await getManifest(init.cache==='no-store');
    try{return Response.json(await querySnapshot(url.pathname,url.searchParams,index,load));}
    catch(e:any){if(e.status)return Response.json({error:e.message},{status:e.status});throw e;}
  })();
  if(!signal)return operation;
  return new Promise<Response>((resolve,reject)=>{
    const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    operation.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted)abort();
  });
}
