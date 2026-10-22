import {digest} from '../../shared/lib/accounts.mjs';
// Community tests seed a server-side session; password registration and session
// verification are exercised independently by accounts.test.mjs.
export function fixtureMember(now){
 const values=new Map(),id='YR-1234567890ABCDEF12345678',token='9'.repeat(64),version='fixture-member-version';
 const store={async get(k){return structuredClone(values.get(k)||null);},async setJSON(k,v){values.set(k,structuredClone(v));}};
 const ready=(async()=>{values.set('profiles/'+id+'.json',{id,nickname:'测试会员',createdAt:new Date(now()).toISOString(),avatarVersion:null});values.set('users/'+id+'.json',{id,version});values.set('sessions/'+await digest(token)+'.json',{id,version,expiresAt:now()+30*86400000});})();
 return {id,values,store,ready,cookie:'yuri_member_session='+token};
}
