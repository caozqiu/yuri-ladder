import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
let cached=null,expires=0;
const seeds=new Map();
export async function onRequest(context){
  const {request}=context;
  if(!['GET','HEAD'].includes(request.method))return Response.json({error:'只读接口'},{status:405,headers:{Allow:'GET, HEAD'}});
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
        if(seeds.size>6)seeds.delete(seeds.keys().next().value);
      }
      return seeds.get(key);
    });
    return new Response(request.method==='HEAD'?null:JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'}});
  }catch(e){return Response.json({error:e.status?e.message:'暂时无法读取完整数据，请稍后重试'},{status:e.status||503,headers:{'Cache-Control':'no-store'}});}
}
