import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PROJECT_ID='makers-i6sbocft2osz';
export async function publishExisting({makers,token,site='china',invoke,checkOnly=false,log=console.log}){
 if(!token)throw new Error('EDGEONE_API_TOKEN is missing');
 if(!['china','global'].includes(site))throw new Error('Invalid account site');
 const project=await makers.projects.get({projectId:PROJECT_ID});
 if(project.projectId!==PROJECT_ID)throw new Error('Project identity mismatch; publishing stopped');
 if(!/^[a-z0-9](?:[a-z0-9-]{3,48})[a-z0-9]$/.test(project.name||''))throw new Error('Existing project has an invalid name');
 if(project.area&&!['overseas','global'].includes(project.area))throw new Error('Unsupported acceleration region; publishing stopped');
 log(JSON.stringify({projectId:PROJECT_ID,name:project.name,area:project.area||'unchanged',access:'verified'}));
 if(checkOnly)return project;
 // An explicit folder is uploaded as static assets. Let the CLI compile the
 // public-only dist project so edge-functions become executable routes.
 const args=['--yes','edgeone@1.6.44','makers','deploy','--name',project.name,'--site',site,'--skip-ai-gateway-sync','--json'];
 if(project.area)args.push('--area',project.area);
 args.push('--token',token);
 await invoke(args,{cwd:resolve('dist')});
 return project;
}
function cli(args,{cwd}){return new Promise((done,fail)=>{
 const child=spawn(process.platform==='win32'?'npx.cmd':'npx',args,{cwd,stdio:['ignore','inherit','inherit'],env:process.env});
 child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error('EdgeOne CLI deployment failed: '+code)));
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const token=process.env.EDGEONE_API_TOKEN;
 try{
  if(!token)throw new Error('EDGEONE_API_TOKEN is missing');
  const {Makers}=await import('@edgeone/makers-sdk');
  const site=process.env.EDGEONE_SITE||'china';
  await publishExisting({makers:new Makers({token,region:site,retries:1,timeout:30}),token,site,invoke:cli,checkOnly:process.argv.includes('--check-only')});
 }catch(error){
  const message=String(error.code||error.message||'Publishing failed');
  console.error(token?message.replaceAll(token,'[redacted]'):message);process.exitCode=1;
 }
}
