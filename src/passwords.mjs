import bcrypt from 'bcryptjs';
import {accountError} from '../shared/lib/accounts.mjs';
export const PASSWORD_COST=10;
// A public dummy hash ensures unknown-account checks perform the same work.
export const DUMMY_HASH='$2b$10$g339.PVfKxnlSO3MNUujHueFKxlJEOtlUQxxWxSw7.lpsBOaK4QCu';
export async function hashPassword(password){
 if(new TextEncoder().encode(password).length>72)throw accountError('密码过长，请使用更短的密码');
 return bcrypt.hash(password,PASSWORD_COST);
}
export async function verifyPassword(password,hash){
 if(typeof password!=='string'||new TextEncoder().encode(password).length>72||!/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/.test(hash||''))return false;
 return bcrypt.compare(password,hash);
}
