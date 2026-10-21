import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export function recordRanking(db,{snapshot,season,observed,players}){
 if(!snapshot||!Number.isInteger(observed)||observed<=0||!players.length||players.length>100)return false;
 const sorted=[...players].sort((a,b)=>a.rank-b.rank);
 if(new Set(sorted.map(p=>p.id)).size!==sorted.length||sorted.some((p,i)=>typeof p.id!=='string'||!/^\d{1,20}$/.test(p.id)||p.rank!==i+1))return false;
 const data=JSON.stringify(sorted.map(p=>[p.id,p.rank,Number.isFinite(p.mmr)?p.mmr:null,p.name||'']));
 const existing=db.connection.prepare('SELECT data FROM ranking_history WHERE snapshot=?').get(snapshot);
 if(existing){
  const names=new Map(sorted.map(p=>[p.id,p.name]));let changed=false;
  const preserved=JSON.parse(existing.data).map(p=>{if(!p[3]&&names.get(p[0])){changed=true;return [...p.slice(0,3),names.get(p[0])];}return p;});
  if(changed)db.connection.prepare('UPDATE ranking_history SET data=? WHERE snapshot=?').run(JSON.stringify(preserved),snapshot);
  return true;
 }
 db.connection.prepare('INSERT INTO ranking_history(snapshot,season,observed,data) VALUES (?,?,?,?) ON CONFLICT(snapshot) DO NOTHING').run(snapshot,season,observed,data);
 return true;
}
export async function captureRankingHistory(db,directory,excluded=[]){
 const skip=new Set(excluded);
 // Reuse only complete public observations with an explicit capture timestamp.
 let index;
 try{index=JSON.parse(await readFile(join(directory,'index.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const entry of [...(index?.snapshots||[]),...(index?.previous||[])]){
  if(skip.has(entry.snapshot)||!entry.created)continue;
  const body=await readFile(join(directory,'snapshots',entry.file.split('/').at(-1)),'utf8');
  if(createHash('sha256').update(body).digest('hex')!==entry.sha256)throw new Error('历史榜单来源校验失败');
  const seed=JSON.parse(body);
  if(seed.snapshot!==entry.snapshot||seed.meta?.missing||seed.meta?.scanned!==seed.players?.length)continue;
  recordRanking(db,{snapshot:entry.snapshot,season:entry.season.id,observed:entry.created,players:seed.players});
 }
 for(const s of db.connection.prepare("SELECT * FROM snapshots WHERE status='complete' ORDER BY created").all()){
  if(skip.has(s.id))continue;
  const players=db.connection.prepare('SELECT data FROM rankings WHERE snapshot=? ORDER BY rank').all(s.id).map(r=>JSON.parse(r.data));
  const meta=JSON.parse(s.meta);
  if(meta.missing||meta.scanned!==players.length)continue;
  recordRanking(db,{snapshot:s.id,season:s.season,observed:s.created,players});
 }
 return db.connection.prepare('SELECT * FROM ranking_history ORDER BY observed,snapshot').all();
}
