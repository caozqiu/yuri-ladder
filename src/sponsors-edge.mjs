import {getStore} from '@edgeone/pages-blob';
import {createSponsorsHandler} from './sponsors-api.mjs';
export async function onRequest({request,env={}}){
 try{
  const secret=env.SPONSOR_ADMIN_PASSWORD;
  const store=getStore({name:'yuri-sponsored-matches',consistency:'strong'});
  return await createSponsorsHandler({store,secret,accountsStore:getStore({name:'yuri-user-accounts',consistency:'strong'})})(request);
 }catch{return new Response(JSON.stringify({error:'赞助赛服务暂时不可用，请稍后重试'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
}
