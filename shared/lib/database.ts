import { env } from 'cloudflare:workers';
import type { Match, Profile } from './types';
export function db():D1Database {if(!env.DB)throw new Error('数据存储尚未连接');return env.DB;}
export async function setting(key:string){const r=await db().prepare('SELECT value FROM site_config WHERE key=?').bind(key).first<{value:string}>();return r?.value??null;}
export async function setSetting(key:string,value:string){await db().prepare('INSERT INTO site_config(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
export function now(){return Math.floor(Date.now()/1000);}
export function gameStatements(snapshot:string,m:Match){
  const d=db();const out=[d.prepare('INSERT INTO games(snapshot,match,start,data) VALUES (?,?,?,?) ON CONFLICT(snapshot,match) DO UPDATE SET start=excluded.start,data=excluded.data').bind(snapshot,m.id,m.start,JSON.stringify(m)),d.prepare('DELETE FROM appearances WHERE snapshot=? AND match=?').bind(snapshot,m.id)];
  if(m.players.length!==2)return out;
  m.players.forEach((p,i)=>{const other=m.players[1-i];if(![0,1,2].includes(p.result))return;out.push(d.prepare('INSERT INTO appearances(snapshot,match,user,opponent,country,enemy,result,start,map) VALUES (?,?,?,?,?,?,?,?,?)').bind(snapshot,m.id,p.id,other.id,Number.isInteger(p.country)?p.country:-1,Number.isInteger(other.country)?other.country:-1,p.result,m.start,m.map));});return out;
}
export function rankingStatements(snapshot:string,profiles:Profile[]){const statements:D1PreparedStatement[]=[];for(let i=0;i<profiles.length;i+=20){const chunk=profiles.slice(i,i+20);statements.push(db().prepare('INSERT INTO rankings(snapshot,user,rank,data) VALUES '+chunk.map(()=>'(?,?,?,?)').join(',')+' ON CONFLICT(snapshot,user) DO UPDATE SET rank=excluded.rank,data=excluded.data').bind(...chunk.flatMap(p=>[snapshot,p.id,p.rank,JSON.stringify(p)])));}return statements;}
export function bulkGameStatements(snapshot:string,matches:Match[]){
 const out:D1PreparedStatement[]=[];
 for(let i=0;i<matches.length;i+=20){const chunk=matches.slice(i,i+20);out.push(db().prepare('INSERT INTO games(snapshot,match,start,data) VALUES '+chunk.map(()=>'(?,?,?,?)').join(',')+' ON CONFLICT(snapshot,match) DO UPDATE SET start=excluded.start,data=excluded.data').bind(...chunk.flatMap(m=>[snapshot,m.id,m.start,JSON.stringify(m)])));out.push(db().prepare('DELETE FROM appearances WHERE snapshot=? AND match IN ('+chunk.map(()=>'?').join(',')+')').bind(snapshot,...chunk.map(m=>m.id)));}
 const rows=matches.flatMap(m=>m.players.map((p,i)=>[snapshot,m.id,p.id,m.players[1-i].id,p.country,m.players[1-i].country,p.result,m.start,m.map]));
 for(let i=0;i<rows.length;i+=10){const chunk=rows.slice(i,i+10);out.push(db().prepare('INSERT INTO appearances(snapshot,match,user,opponent,country,enemy,result,start,map) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?,?,?)').join(',')).bind(...chunk.flat()));}
 return out;
}
export async function publish(snapshot:string,meta:Record<string,unknown>){const s=await db().prepare('SELECT season FROM snapshots WHERE id=?').bind(snapshot).first<{season:number}>();if(!s)throw new Error('找不到采集批次');const count=await db().prepare('SELECT COUNT(*) AS n,MIN(rank) AS first,MAX(rank) AS last FROM rankings WHERE snapshot=?').bind(snapshot).first<{n:number;first:number;last:number}>();if(count?.first!==1||count?.last!==count?.n)throw new Error('榜单排名不连续，保留上次成功数据');if(meta.missing||Number(meta.scanned)!==count?.n)throw new Error('采集未完成，保留上次成功数据');await db().batch([db().prepare('UPDATE snapshots SET status=\'complete\',meta=? WHERE id=?').bind(JSON.stringify(meta),snapshot),db().prepare('INSERT INTO site_config(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('active:'+s.season,snapshot)]);}
