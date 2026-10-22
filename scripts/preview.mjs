import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('dist');
const {createSponsorsHandler}=await import('../src/sponsors-api.mjs');
const {createFileStore}=await import('../src/sponsors-file-store.mjs');
const sponsors=createSponsorsHandler({store:createFileStore(process.env.YURI_SPONSOR_PREVIEW_DIR||'.runtime/sponsors-preview'),secret:process.env.SPONSOR_ADMIN_PASSWORD});
const api=await import(pathToFileURL(resolve('dist/edge-functions/api/stats.js')));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+server.address().port);
  if(url.pathname.startsWith('/api/')){
   if(['/api/sponsors','/api/events'].includes(url.pathname)){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24576){res.writeHead(413).end();return;}chunks.push(chunk);}const response=await sponsors(new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}));response.headers.forEach((v,k)=>res.setHeader(k,v));res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()));return;}
   if(!['/api/stats','/api/matches','/api/history'].includes(url.pathname)){res.writeHead(404).end();return;}
   const response=await api.onRequest({request:new Request(url,{method:req.method})});
   response.headers.forEach((v,k)=>res.setHeader(k,v));res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const file=resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,''));
  if(!file.startsWith(root+sep)||url.pathname.startsWith('/edge-functions/')||file.endsWith('edgeone.json')){res.writeHead(404).end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?null:body);
 }catch{res.writeHead(404).end();}
});
server.listen(Number(process.env.PORT||5188),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
