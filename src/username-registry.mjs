import {accountError,normalizeUsername,digest} from '../shared/lib/accounts.mjs';
import {usernameSigningScalar,base64url} from '../shared/lib/username-signing.mjs';
import {p256} from '@noble/curves/nist.js';
export function createUsernameRegistry({secret,publicKey,url,fetcher=fetch}){
 if(typeof secret!=='string'||secret.length<24||!publicKey||url!=='https://yr-ladder-observatory.deep-spoon-6795.chatgpt.site/api/member-names')return null;
 let publicJwk;try{publicJwk=JSON.parse(publicKey);if(publicJwk.kty!=='EC'||publicJwk.crv!=='P-256'||!publicJwk.x||!publicJwk.y)return null;}catch{return null;}
 async function call(action,username,accountId){
  const body=JSON.stringify({action,nameHash:await digest(normalizeUsername(username)),...(accountId?{accountId}:{})}),time=String(Date.now());
  // EdgeOne does not implement every native WebCrypto key import. Use the
  // audited JS P-256 signer; wire format stays compatible with D1's verifier.
  let signature;try{const scalar=await usernameSigningScalar(secret);signature=base64url(p256.sign(new TextEncoder().encode(time+'\n'+body),scalar,{prehash:true,format:'compact',extraEntropy:true}));}catch{const error=accountError('用户名签名暂不可用，请使用账号编号登录',503);error.code='USERNAME_SIGNATURE';throw error;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','X-Registry-Time':time,'X-Registry-Signature':signature},body,signal:controller.signal});const data=await response.json();if(response.status===409)throw accountError('该用户名已被使用，请换一个',409);if(!response.ok)throw Error('Registry unavailable');return data.accountId;}
  catch(e){if(e.status===409)throw e;const error=accountError('用户名服务暂时不可用，请稍后重试；已有账号仍可使用YR编号登录',503);error.code='USERNAME_REGISTRY';throw error;}finally{clearTimeout(timer);}
 }
 return {lookup:username=>call('lookup',username),claim:(username,id)=>call('claim',username,id)};
}
