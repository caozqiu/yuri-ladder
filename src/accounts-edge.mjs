import {getStore} from '@edgeone/pages-blob';
import {createAccountsHandler} from './accounts-api.mjs';
import {createUsernameRegistry} from './username-registry.mjs';
export async function onRequest({request,env={}}){
 try{return await createAccountsHandler({store:getStore({name:'yuri-user-accounts',consistency:'strong'}),secret:env.SPONSOR_ADMIN_PASSWORD,registry:createUsernameRegistry({secret:env.SPONSOR_ADMIN_PASSWORD,publicKey:env.USERNAME_REGISTRY_PUBLIC_KEY,url:env.USERNAME_REGISTRY_URL})})(request);}
 catch{return new Response(JSON.stringify({error:'账号服务暂时不可用'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
}
