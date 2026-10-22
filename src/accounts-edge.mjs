import {getStore} from '@edgeone/pages-blob';
import {createAccountsHandler} from './accounts-api.mjs';
export async function onRequest({request,env={}}){
 try{return await createAccountsHandler({store:getStore({name:'yuri-user-accounts',consistency:'strong'}),secret:env.SPONSOR_ADMIN_PASSWORD})(request);}
 catch{return new Response(JSON.stringify({error:'账号服务暂时不可用'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
}
