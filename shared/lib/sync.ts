import {db,setting,setSetting,now,bulkGameStatements,rankingStatements,publish} from './database';
import {source,twoAtOnce} from './source';
import {verifiedKnownMatch} from './known-match.mjs';
import {normalizeObservations,normalizeSummary} from './core.mjs';
import {rankingPage,validateRoster} from './ranked-roster.mjs';
import type {Match,Profile,Season} from './types';
type Work={sid:number;uid:string;token:string;stop:number;done:boolean};
type RankWork={season:Season;page:number;count:number|null;done:boolean};
type Run={roster?:string;rankings?:RankWork[];id:string;phase:string;index:number;players:Work[];snapshots:Record<string,string>;cutoff:number;full:boolean;excluded:number;unknown:number;error?:string};
async function lease(){const value=JSON.stringify({id:crypto.randomUUID(),expires:now()+240});const r=await db().prepare("INSERT INTO site_config(key,value) VALUES ('sync_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(site_config.value,'$.expires') AS INTEGER)<?").bind(value,now()).run();if(!r.meta.changes)throw new Error('已有同步步骤正在运行');return async()=>{await db().prepare("DELETE FROM site_config WHERE key='sync_lock' AND value=?").bind(value).run();};}
export async function syncStatus(){
 const r=await db().prepare('SELECT id,state,data,updated FROM sync_jobs ORDER BY updated DESC,rowid DESC LIMIT 1').first<{id:string;state:string;data:string;updated:number}>();if(!r)return {state:'idle'};const d=JSON.parse(r.data);
 const remaining=(await db().prepare('SELECT COUNT(DISTINCT match) AS n FROM pending WHERE snapshot IN (SELECT id FROM snapshots WHERE status=\'staging\')').first<{n:number}>())?.n||0;
 return {id:r.id,state:r.state,phase:d.phase,roster:d.roster||'top100',playersDone:d.index,totalPlayers:d.phase==='rankings'?(d.rankings||[]).reduce((n:number,w:RankWork)=>n+(w.count||0),0):d.players?.length||0,pendingMatches:remaining,rankings:(d.rankings||[]).map((w:RankWork)=>({season:w.season.id,collected:w.done?w.count:(w.page-1)*25,total:w.count})),updated:r.updated,error:d.error||null};
}
async function save(run:Run,state='running'){await db().prepare('INSERT INTO sync_jobs(id,state,data,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data,updated=excluded.updated').bind(run.id,state,JSON.stringify(run),now()).run();}
export async function startSync(forceFull=false){const release=await lease();try{
 const current=await db().prepare("SELECT id,data FROM sync_jobs WHERE state IN ('running','retry') ORDER BY updated DESC,rowid DESC LIMIT 1").first<{id:string;data:string}>();
 if(current){
  if(JSON.parse(current.data).roster==='all')return {...await syncStatus(),resumed:true};
  // Upgrade an unfinished legacy top-100 staging job; complete publications stay intact.
  const old=JSON.parse(current.data);for(const snapshot of Object.values(old.snapshots||{})){
   const status=await db().prepare('SELECT status FROM snapshots WHERE id=?').bind(snapshot).first<{status:string}>();
   if(status?.status==='staging')await db().batch(['appearances','games','rankings','pending'].map(t=>db().prepare('DELETE FROM '+t+' WHERE snapshot=?').bind(snapshot)).concat([db().prepare('DELETE FROM snapshots WHERE id=?').bind(snapshot)]));
  }
  await db().prepare("UPDATE sync_jobs SET state='superseded' WHERE id=?").bind(current.id).run();
 }
 const ss:any[]=await source('/battlecenter/qualifying/v1/seasons');const seasons:Season[]=ss.filter(s=>s.startTime<=now()).slice(0,2).map(s=>({id:s.seasonId,name:s.seasonName,start:s.startTime,end:s.endTime}));
 if(!seasons.length)throw new Error('来源赛季名单为空');
 const full=forceFull||now()-Number(await setting('last_full')||0)>7*86400;
 const run:Run={id:crypto.randomUUID(),roster:'all',rankings:seasons.map(season=>({season,page:1,count:null,done:false})),phase:'rankings',index:0,players:[],snapshots:{},cutoff:now(),full,excluded:0,unknown:0};
 for(const season of seasons){
  await db().prepare('INSERT INTO seasons(id,name,start,end) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,start=excluded.start,end=excluded.end').bind(season.id,season.name,season.start,season.end).run();
  const snapshot=run.id+':'+season.id;run.snapshots[season.id]=snapshot;
  await db().prepare("INSERT INTO snapshots(id,season,cutoff,created,status,meta) VALUES (?,?,?,?,'staging','{}')").bind(snapshot,season.id,Math.min(run.cutoff,season.end),now()).run();
 }
 await save(run);return syncStatus();}finally{await release();}}
async function collectRankings(run:Run){
 const work=run.rankings!.find(w=>!w.done);
 if(work){
  const sid=work.season.id,snapshot=run.snapshots[sid];
  const data=await source('/battlecenter/qualifying/v1/rank?seasonId='+sid+'&version=0&pageNum='+work.page+'&pageSize=25&startRank=0');
  let page;
  try{page=rankingPage(data,work.page,work.count);}catch(e){
   // A growing or shrinking ladder must not leave a saved cursor pinned to
   // an obsolete total forever. Reset only this unfinished ranking list.
   const count=Number(data?.count);
   if(work.count!==null&&Number.isSafeInteger(count)&&count>0&&count!==work.count){await db().prepare('DELETE FROM rankings WHERE snapshot=?').bind(snapshot).run();work.page=1;work.count=null;}
   throw e;
  }
  await db().batch(rankingStatements(snapshot,page.players));work.count=page.count;
  if(work.page===page.totalPages){
   const rows=(await db().prepare('SELECT data FROM rankings WHERE snapshot=? ORDER BY rank').bind(snapshot).all<{data:string}>()).results.map(r=>JSON.parse(r.data));
   try{validateRoster(rows,page.count);}catch(e){await db().prepare('DELETE FROM rankings WHERE snapshot=?').bind(snapshot).run();work.page=1;work.count=null;throw e;}
   work.done=true;
  }else work.page++;
 }
 if(run.rankings!.every(w=>w.done)){
  // Rebuild deterministically if a process stops during this transition.
  run.players=[];
  for(const w of run.rankings!){
   const sid=w.season.id,snapshot=run.snapshots[sid];
   const profiles=(await db().prepare('SELECT data FROM rankings WHERE snapshot=? ORDER BY rank').bind(snapshot).all<{data:string}>()).results.map(r=>JSON.parse(r.data)) as Profile[];
   const active=await setting('active:'+sid);let oldUsers=new Set<string>(),oldCutoff=0;
   if(active){
    const old=await db().prepare('SELECT cutoff FROM snapshots WHERE id=?').bind(active).first<{cutoff:number}>();oldCutoff=old?.cutoff||0;
    oldUsers=new Set((await db().prepare('SELECT user FROM rankings WHERE snapshot=?').bind(active).all<{user:string}>()).results.map(r=>r.user));
    if(!run.full)await db().batch([db().prepare('INSERT OR IGNORE INTO games(snapshot,match,start,data) SELECT ?,match,start,data FROM games WHERE snapshot=?').bind(snapshot,active),db().prepare('INSERT OR IGNORE INTO appearances(snapshot,match,user,opponent,country,enemy,result,start,map) SELECT ?,match,user,opponent,country,enemy,result,start,map FROM appearances WHERE snapshot=?').bind(snapshot,active)]);
   }
   profiles.forEach(p=>run.players.push({sid,uid:p.id,token:'',done:false,stop:!run.full&&oldUsers.has(p.id)?Math.max(w.season.start,oldCutoff-48*3600):0}));
  }
  run.phase='list';
 }
}
export async function syncStep(){const release=await lease();let run:Run|undefined;try{const record=await db().prepare("SELECT data FROM sync_jobs WHERE state IN ('running','retry') ORDER BY updated DESC,rowid DESC LIMIT 1").first<{data:string}>();if(!record)return syncStatus();run=JSON.parse(record.data);if(!run)throw new Error('同步状态丢失');delete run.error;
 if(run.phase==='rankings'){await collectRankings(run);await save(run);
 }else if(run.phase==='list'){
   const todo=run.players.filter(p=>!p.done).slice(0,2);
   await twoAtOnce(todo,async p=>{for(let i=0;i<4&&!p.done;i++){const r=await source(`/datacenter/redalert/match/v1/list?userId=${p.uid}&seasonId=${p.sid}&limit=30&gameType=4&state=&nextToken=${encodeURIComponent(p.token)}`);if(!Array.isArray(r.list))throw new Error('来源战绩分页缺失，保留采集进度');const rows:any[]=r.list;const snapshot=run!.snapshots[p.sid];const valid=rows.filter(m=>m.gameVersion===0&&m.gameType===4&&m.playerCount===2&&!m.single);if(valid.length){const statements:D1PreparedStatement[]=[];for(let offset=0;offset<valid.length;offset+=20){const chunk=valid.slice(offset,offset+20);statements.push(db().prepare('INSERT INTO pending(snapshot,match,user,data) VALUES '+chunk.map(()=>'(?,?,?,?)').join(',')+' ON CONFLICT(snapshot,match,user) DO UPDATE SET data=excluded.data').bind(...chunk.flatMap(m=>[snapshot,String(m.matchId),p.uid,JSON.stringify(m)])));}await db().batch(statements);}const next=String(r.nextToken||'');if(next&&next===p.token&&rows.length)throw new Error('来源翻页游标未前进');const beyond=p.stop>0&&rows.some(m=>m.startTime<p.stop);p.done=!next||beyond;p.token=next;}});
   run.index=run.players.filter(p=>p.done).length;if(run.index===run.players.length)run.phase='summary';await save(run);
 }else if(run.phase==='summary'){
  const todo=(await db().prepare('SELECT snapshot,match FROM pending GROUP BY snapshot,match ORDER BY match DESC LIMIT 20').all<{snapshot:string;match:string}>()).results;
  if(todo.length){
   const observations=(await db().prepare('SELECT snapshot,match,data FROM pending WHERE '+todo.map(()=>'(snapshot=? AND match=?)').join(' OR ')).bind(...todo.flatMap(p=>[p.snapshot,p.match])).all<{snapshot:string;match:string;data:string}>()).results;
   const knownRows=(await db().prepare('SELECT snapshot,match,data FROM games WHERE '+todo.map(()=>'(snapshot=? AND match=?)').join(' OR ')).bind(...todo.flatMap(p=>[p.snapshot,p.match])).all<{snapshot:string;match:string;data:string}>()).results;
   const resolved=await twoAtOnce(todo,async p=>{const rows=observations.filter(r=>r.snapshot===p.snapshot&&r.match===p.match).map(r=>JSON.parse(r.data));const sid=Number(p.snapshot.split(':').at(-1));const known=knownRows.find(r=>r.snapshot===p.snapshot&&r.match===p.match);let m=(normalizeObservations(rows,sid)||verifiedKnownMatch(rows,known?JSON.parse(known.data):null,sid)) as Match|null;
    if(!m&&!rows.every(r=>r.status===3))m=normalizeSummary(await source('/datacenter/redalert/match/v1/summary?matchId='+p.match),sid) as Match|null;
    if(m&&m.players.some(p=>!Number.isInteger(p.country)||p.country<0||p.country>9))throw new Error('来源比赛国家暂不完整，保留待核查记录');return {...p,game:m};});
   const statements:D1PreparedStatement[]=[];
   for(const snapshot of new Set(todo.map(p=>p.snapshot))){const records=resolved.filter(p=>p.snapshot===snapshot);const valid=records.flatMap(p=>p.game?[p.game]:[]);const invalid=records.filter(p=>!p.game).map(p=>p.match);statements.push(...bulkGameStatements(snapshot,valid));if(invalid.length){for(const table of ['games','appearances'])statements.push(db().prepare(`DELETE FROM ${table} WHERE snapshot=? AND match IN (${invalid.map(()=>'?').join(',')})`).bind(snapshot,...invalid));}statements.push(db().prepare('DELETE FROM pending WHERE snapshot=? AND match IN ('+records.map(()=>'?').join(',')+')').bind(snapshot,...records.map(p=>p.match)));}
   await db().batch(statements);run.excluded+=resolved.filter(p=>!p.game).length;
  }
  if(!todo.length){for(const [sid,snapshot] of Object.entries(run.snapshots)){const n=run.players.filter(p=>p.sid===Number(sid)).length;await publish(snapshot,{scanned:n,players:n,missing:0,excluded:run.excluded,unknown:run.unknown,full:run.full,roster:run.roster||'top100',officialPlayers:n});}if(run.full)await setSetting('last_full',String(run.cutoff));run.phase='complete';await save(run,'complete');await prune();}else await save(run);
 }
 return syncStatus();
 }catch(e){if(run){run.error=e instanceof Error?e.message:String(e);await save(run,'retry');}throw e;}finally{await release();}}
async function prune(){const ss=(await db().prepare('SELECT id FROM seasons ORDER BY id DESC LIMIT 2').all<{id:number}>()).results;for(const s of ss){const old=(await db().prepare("SELECT id FROM snapshots WHERE season=? AND status='complete' ORDER BY created DESC LIMIT -1 OFFSET 2").bind(s.id).all<{id:string}>()).results;for(const x of old)await db().batch(['appearances','games','rankings','pending'].map(t=>db().prepare(`DELETE FROM ${t} WHERE snapshot=?`).bind(x.id)).concat([db().prepare('DELETE FROM snapshots WHERE id=?').bind(x.id)]));}}
