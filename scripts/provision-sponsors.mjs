import {randomBytes} from 'node:crypto';
import {Makers} from '@edgeone/makers-sdk';
import {PROJECT_ID} from './deploy.mjs';
// Runs only in the trusted deployment job. Never print credentials or write
// them into source/artifacts. An existing owner's password is always retained.
const token=process.env.EDGEONE_API_TOKEN;
try{
 if(!token)throw Error('Deployment credential missing');
 const makers=new Makers({token,region:process.env.EDGEONE_SITE||'china',timeout:30,retries:1});
 const project=await makers.projects.get({projectId:PROJECT_ID});
 if(project.projectId!==PROJECT_ID)throw Error('Project mismatch');
 const envs=await makers.projects.listEnvs({projectId:PROJECT_ID});
 const password=envs.find(e=>e.key==='SPONSOR_ADMIN_PASSWORD');
 if(password){if(password.value.length<24)throw Error('SPONSOR_ADMIN_PASSWORD must contain at least 24 characters');console.log('Sponsor owner access already configured; password unchanged.');}
 else{await makers.projects.setEnvs({projectId:PROJECT_ID,envVars:[{key:'SPONSOR_ADMIN_PASSWORD',value:randomBytes(32).toString('base64url'),comment:'赞助赛站主审核密码；请在控制台查看并妥善保管，切勿公开。'}]});console.log('Sponsor owner access configured. The owner can view SPONSOR_ADMIN_PASSWORD in the existing EdgeOne project environment variables.');}
}catch(error){console.error('Sponsor access setup failed: '+String(error.code||'CONFIGURATION_FAILED'));process.exitCode=1;}
