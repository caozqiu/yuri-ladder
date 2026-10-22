export const ACCOUNT_ID=/^YR-[A-F0-9]{24}$/;
export const HEX_KEY=/^[a-f0-9]{64}$/;
export const ACCOUNT_COOKIE='yuri_member_session';
export const PASSWORD_ITERATIONS=600000;
export const accountError=(message,status=400)=>Object.assign(new Error(message),{status});
export const randomKey=(bytes=32)=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;};
export const normalizeAccount=value=>typeof value==='string'?value.trim().toUpperCase():'';
export const accountId=async key=>'YR-'+(await digest(key)).slice(0,24).toUpperCase();
export function validateNickname(value){const s=typeof value==='string'?value.normalize('NFKC').trim():'';if(!s||[...s].length>24||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(s))throw accountError('昵称须为1–24个字，不能包含控制字符');return s;}
export function validatePassword(value){if(typeof value!=='string'||value.length<10||value.length>128)throw accountError('密码须为10–128个字符');return value;}
export async function hashPassword(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return [...new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:PASSWORD_ITERATIONS,salt:new TextEncoder().encode(salt)},material,256))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const profileView=profile=>({id:profile.id,nickname:profile.nickname,avatar:profile.avatarVersion?'/api/account?'+new URLSearchParams({action:'avatar',id:profile.id,v:profile.avatarVersion}):null,createdAt:profile.createdAt});
export function validateAvatar(input){
 if(typeof input!=='string'||input.length>360000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(input))throw accountError('请上传PNG或JPEG头像，处理后不超过256KB');
 const [head,data]=input.split(',');let bytes;try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{throw accountError('头像编码不正确');}
 if(bytes.length>262144||bytes.length<33)throw accountError('头像文件过大或不完整');let width=0,height=0,type='';
 if(head==='data:image/png;base64'&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)&&String.fromCharCode(...bytes.slice(12,16))==='IHDR'){
  const v=new DataView(bytes.buffer);width=v.getUint32(16);height=v.getUint32(20);type='image/png';
 }else if(head==='data:image/jpeg;base64'&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
  for(let i=2;i+9<bytes.length;){if(bytes[i]!==255)break;const marker=bytes[i+1];if(marker===218)break;const size=bytes[i+2]*256+bytes[i+3];if(size<2)break;if([192,193,194].includes(marker)){height=bytes[i+5]*256+bytes[i+6];width=bytes[i+7]*256+bytes[i+8];type='image/jpeg';break;}i+=size+2;}
 }
 if(!type||width<1||height<1||width>640||height>640)throw accountError('头像须为有效PNG或JPEG，宽高不超过640像素');
 return {type,data,width,height};
}
