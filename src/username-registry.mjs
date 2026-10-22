import {accountError,normalizeUsername,digest} from '../shared/lib/accounts.mjs';
import {usernameSigningScalar,base64url} from '../shared/lib/username-signing.mjs';
export function createUsernameRegistry({secret,publicKey,url,fetcher=fetch}){
 if(typeof secret!=='string'||secret.length<24||!publicKey||url!=='https://yr-ladder-observatory.deep-spoon-6795.chatgpt.site/api/member-names')return null;
 let publicJwk;try{publicJwk=JSON.parse(publicKey);if(publicJwk.kty!=='EC'||publicJwk.crv!=='P-256'||!publicJwk.x||!publicJwk.y)return null;}catch{return null;}
 async function call(action,username,accountId){
  const body=JSON.stringify({action,nameHash:await digest(normalizeUsername(username)),...(accountId?{accountId}:{})}),time=String(Date.now());
  const scalar=await usernameSigningScalar(secret),key=await crypto.subtle.importKey('jwk',{...publicJwk,d:base64url(scalar),key_ops:['sign'],ext:false},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(time+'\n'+body)));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','X-Registry-Time':time,'X-Registry-Signature':signature},body,signal:controller.signal});const data=await response.json();if(response.status===409)throw accountError('该用户名已被使用，请换一个',409);if(!response.ok)throw Error('Registry unavailable');return data.accountId;}
  catch(e){if(e.status===409)throw e;throw accountError('用户名服务暂时不可用，请稍后重试；已有账号仍可使用YR编号登录',503);}finally{clearTimeout(timer);}
 }
 return {lookup:username=>call('lookup',username),claim:(username,id)=>call('claim',username,id)};
}
