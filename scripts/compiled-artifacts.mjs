import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';
const assignment=/"SPONSOR_ADMIN_PASSWORD"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
export function hasEmbeddedOwnerSecret(text){return [...text.matchAll(assignment)].some(m=>m[1].length>0);}
export async function sanitizeCompiledZip(bytes){
 const zip=await JSZip.loadAsync(bytes);let removed=0;
 for(const [name,file]of Object.entries(zip.files))if(!file.dir&&/\.(js|json)$/.test(name)){
  const text=await file.async('string');
  const clean=text.replace(assignment,(_,value)=>{if(value)removed++;return '"SPONSOR_ADMIN_PASSWORD":""';});
  if(clean!==text)zip.file(name,clean);
 }
 if(!removed)throw Error('Expected compiler-injected owner configuration was not found; package review required');
 zip.file('上传说明.txt','本包已移除站主审核密码，社区申请和审核默认关闭。\n请使用源码包及现有 GitHub Actions 自动发布，以从 EdgeOne 项目环境变量重新编译启用社区功能。\n不要将含审核密码的编译产物上传到公开仓库或共享下载。\n');
 const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const checked=await JSZip.loadAsync(output,{checkCRC32:true});
 for(const [name,file]of Object.entries(checked.files))if(!file.dir&&/\.(js|json)$/.test(name)&&hasEmbeddedOwnerSecret(await file.async('string')))throw Error('Owner secret remained in shareable package');
 return {bytes:output,removed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const path=process.argv[2];if(!path)throw Error('Compiled ZIP path is required');
 const result=await sanitizeCompiledZip(await readFile(path));await writeFile(path,result.bytes);
 console.log(JSON.stringify({shareableCompiledArtifact:true,ownerValuesRemoved:result.removed,communityRequiresSourceDeployment:true}));
}
