import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
// Local preview only. Production uses the private EdgeOne Blob namespace.
export function createFileStore(directory){
 const root=resolve(directory);
 const file=key=>{const path=resolve(root,key);if(!path.startsWith(root+sep)||!key.endsWith('.json'))throw Error('Invalid local key');return path;};
 return {
  async get(key){try{return JSON.parse(await readFile(file(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async setJSON(key,data){const path=file(key);await mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(data));await rename(temp,path);},
  async list({prefix='',cursor='',limit=30}={}){
   const keys=[];async function walk(dir,base=''){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const e of entries){const key=base+e.name;if(e.isDirectory())await walk(resolve(dir,e.name),key+'/');else if(key.endsWith('.json')&&key.startsWith(prefix)&&key>cursor)keys.push(key);}}
   await walk(root);keys.sort();return {blobs:keys.slice(0,limit).map(key=>({key})),cursor:keys.length>limit?keys[limit-1]:undefined};
  }
 };
}
