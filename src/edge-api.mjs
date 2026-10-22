import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
let cached=null,expires=0;
const seeds=new Map();
// EdgeOne implements the Response constructor but not Response.json().
function json(value,status,headers={}){
 return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff',...headers}});
}
export async function onRequest(context){
  const {request}=context;
  if(!['GET','HEAD'].includes(request.method))return json({error:'只读接口'},405,{Allow:'GET, HEAD','Cache-Control':'no-store'});
  const url=new URL(request.url);
  try{
    if(!cached||Date.now()>expires){
      const response=await fetch(new URL('/data/index.json',url),{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('数据清单不可用');
      cached=await response.json();expires=Date.now()+30000;
    }
    const data=await querySnapshot(url.pathname,url.searchParams,cached,async entry=>{
      const key=url.origin+entry.file;
      if(!seeds.has(key)){
        const response=await fetch(new URL(entry.file,url));
        if(!response.ok)throw new Error('数据文件不可用');
        const seed=await response.json();seeds.set(key,seed);
        if(seeds.size>1)seeds.delete(seeds.keys().next().value);
      }
      return seeds.get(key);
    });
    return new Response(request.method==='HEAD'?null:JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'}});
  }catch(e){return json({error:e.status?e.message:'暂时无法读取完整数据，请稍后重试'},e.status||503,{'Cache-Control':'no-store'});}
}
