import {createECDH,createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {Makers} from '@edgeone/makers-sdk';
import {PROJECT_ID} from './deploy.mjs';
import {usernameSigningScalar,base64url,canonicalPublicKey} from '../shared/lib/username-signing.mjs';
const token=process.env.EDGEONE_API_TOKEN;
try{
 if(!token)throw Error('Missing deployment authorization');
 const makers=new Makers({token,region:process.env.EDGEONE_SITE||'china',timeout:30,retries:1});
 const project=await makers.projects.get({projectId:PROJECT_ID});if(project.projectId!==PROJECT_ID)throw Error('Project mismatch');
 const envs=await makers.projects.listEnvs({projectId:PROJECT_ID}),secret=envs.find(e=>e.key==='SPONSOR_ADMIN_PASSWORD')?.value;
 if(typeof secret!=='string'||secret.length<24)throw Error('Existing owner configuration missing');
 const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(await usernameSigningScalar(secret));const point=ecdh.getPublicKey();
 const publicKey={kty:'EC',crv:'P-256',x:base64url(point.subarray(1,33)),y:base64url(point.subarray(33,65))};
 const keyId=createHash('sha256').update(canonicalPublicKey(publicKey)).digest('hex');
 const value=canonicalPublicKey(publicKey),registryUrl='https://yr-ladder-observatory.deep-spoon-6795.chatgpt.site/api/member-names';
 await makers.projects.setEnvs({projectId:PROJECT_ID,envVars:[{key:'USERNAME_REGISTRY_PUBLIC_KEY',value,comment:'唯一用户名服务的公开验证密钥，不含私钥。'},{key:'USERNAME_REGISTRY_URL',value:registryUrl,comment:'现有站点数据库唯一用户名服务。'}]});
 const current=await makers.projects.listEnvs({projectId:PROJECT_ID});if(current.find(e=>e.key==='SPONSOR_ADMIN_PASSWORD')?.value!==secret||current.find(e=>e.key==='USERNAME_REGISTRY_PUBLIC_KEY')?.value!==value)throw Error('Configuration readback failed');
 await mkdir('.runtime',{recursive:true});await writeFile('.runtime/username-registry-public.json',JSON.stringify({projectId:PROJECT_ID,publicKey,keyId,registryUrl,containsPrivateKey:false},null,2)+'\n');
 console.log(JSON.stringify({publicVerificationKeyPrepared:true,keyId,ownerConfigurationUnchanged:true,containsPrivateKey:false}));
}catch(error){console.error('Username registry setup failed: '+String(error.code||'CONFIGURATION_FAILED'));process.exitCode=1;}
