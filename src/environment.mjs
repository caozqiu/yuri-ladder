import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SQLiteDatabase} from './sqlite.mjs';
export const applicationRoot=dirname(fileURLToPath(import.meta.url));
export const dataDirectory=resolve(process.env.YURI_DATA_DIR||join(applicationRoot,'data'));
export const env={DB:new SQLiteDatabase(join(dataDirectory,'yuri.sqlite'))};
env.DB.migrate(join(applicationRoot,'migrations'));
