import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {accountError,normalizeUsername} from '../shared/lib/accounts.mjs';
// Local preview owns a separate SQLite registry; production uses the existing
// cloud D1 service and never imports this adapter.
export function createPreviewUsernameRegistry(directory){
 const root=resolve(directory);mkdirSync(root,{recursive:true});const db=new DatabaseSync(resolve(root,'username-registry.sqlite'));
 db.exec('CREATE TABLE IF NOT EXISTS username_claims(name TEXT PRIMARY KEY,id TEXT NOT NULL)');
 return {async lookup(value){return db.prepare('SELECT id FROM username_claims WHERE name=?').get(normalizeUsername(value))?.id||null;},async claim(value,id){const name=normalizeUsername(value);db.prepare('INSERT INTO username_claims(name,id) VALUES (?,?) ON CONFLICT DO NOTHING').run(name,id);const owner=db.prepare('SELECT id FROM username_claims WHERE name=?').get(name).id;if(owner!==id)throw accountError('该用户名已被使用，请换一个',409);return id;},close(){db.close();}};
}
