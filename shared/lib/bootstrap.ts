import {db,setting,setSetting,now,rankingStatements,bulkGameStatements,publish} from './database';
import initial31 from '@/data/season-31.json';
import initial30 from '@/data/season-30.json';
import type {Match,Profile,Season} from './types';
type Seed={season:Season;snapshot:string;cutoff:number;players:Profile[];matches:Match[];meta:Record<string,unknown>};
const seeds=[initial31,initial30] as Seed[];
export const bootstrapSnapshots=seeds.map(s=>s.snapshot);
// Owner-only, replay-safe import. Progress advances only after the D1 batch commits.
export async function bootstrapStep(){
 for(const seed of seeds){
  const s=seed.season;
  if(await setting('active:'+s.id))continue;
  const id=seed.snapshot,key='bootstrap_cursor:'+s.id;
  const cursor=Number(await setting(key)||0);
  if(!cursor){await db().prepare('INSERT INTO seasons(id,name,start,end) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,start=excluded.start,end=excluded.end').bind(s.id,s.name,s.start,s.end).run();await db().prepare("INSERT INTO snapshots(id,season,cutoff,created,status,meta) VALUES (?,?,?,?,'staging','{}') ON CONFLICT(id) DO NOTHING").bind(id,s.id,seed.cutoff,now()).run();await db().batch(rankingStatements(id,seed.players));}
  const chunk=seed.matches.slice(cursor,cursor+500);
  if(chunk.length)await db().batch(bulkGameStatements(id,chunk));
  const next=cursor+chunk.length;await setSetting(key,String(next));
  if(next===seed.matches.length){const count=await db().prepare('SELECT COUNT(*) AS n FROM games WHERE snapshot=?').bind(id).first<{n:number}>();if(count?.n!==next)throw new Error('初始比赛数量核对失败');await publish(id,seed.meta);}
  return {state:'importing',season:s.id,done:next,total:seed.matches.length};
 }
 if(!await setting('last_full'))await setSetting('last_full',String(initial31.cutoff));
 return {state:'complete',seasons:seeds.map(s=>({season:s.season.id,players:s.players.length,matches:s.matches.length}))};
}
