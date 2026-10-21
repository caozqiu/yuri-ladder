import { db, setting, now } from '@/lib/database';
import { summarize, windowStart } from '@/lib/core.mjs';
import type { Season, Profile } from '@/lib/types';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const q=new URL(request.url).searchParams;
 const seasons=(await db().prepare('SELECT id,name,start,end FROM seasons ORDER BY id DESC LIMIT 2').all<Season>()).results;
 const season=seasons.find(s=>s.id===Number(q.get('season')))||seasons[0]||null;
 const range=['7d','30d'].includes(q.get('range')||'')?q.get('range')!:'season';
 const scope=q.get('opponents')==='top100'?'top100':'all',granularity=q.get('group')==='country'?'country':'faction';
 const player=q.get('player');if(player&&!/^\d{1,20}$/.test(player))return Response.json({error:'选手编号无效'},{status:400});
 const job=await db().prepare('SELECT state,data FROM sync_jobs ORDER BY updated DESC LIMIT 1').first<{state:string;data:string}>();const j=job?JSON.parse(job.data):null;
 const progress=j?{state:job!.state,stage:j.phase||'list',done:j.index||0,total:j.players?.length||0,error:j.error||undefined}:null;
 const active=season?await setting('active:'+season.id):null;
 const snapshot=active?await db().prepare("SELECT id,cutoff,meta,created FROM snapshots WHERE id=? AND status='complete'").bind(active).first<{id:string;cutoff:number;meta:string;created:number}>():null;
 if(!season||!snapshot)return Response.json({seasons,season,snapshot:null,cutoff:null,meta:{scanned:0,players:100,missing:0,excluded:0,unknown:0},progress,...summarize([],[],granularity),window:range,scope,granularity,stale:false},{headers:{'Cache-Control':'no-store'}});
 const profiles=(await db().prepare('SELECT data FROM rankings WHERE snapshot=? ORDER BY rank').bind(snapshot.id).all<{data:string}>()).results.map(r=>JSON.parse(r.data) as Profile);
 if(player&&!profiles.some(p=>p.id===player))return Response.json({error:'该选手不在所选赛季的前100名中'},{status:404});
 const start=windowStart(season,snapshot.cutoff,range),where=scope==='top100'?' AND EXISTS(SELECT 1 FROM rankings o WHERE o.snapshot=a.snapshot AND o.user=a.opponent)':'';
 const rows=await db().prepare(`SELECT a.user,a.country,a.enemy,SUM(a.result=1) AS wins,SUM(a.result=0) AS losses FROM appearances a JOIN rankings r ON r.snapshot=a.snapshot AND r.user=a.user WHERE a.snapshot=? AND a.result IN (0,1) AND a.start>=? AND a.start<=?${where} GROUP BY a.user,a.country,a.enemy`).bind(snapshot.id,start,snapshot.cutoff).all();
 const count=await db().prepare(`SELECT COUNT(DISTINCT a.match) AS n FROM appearances a JOIN rankings r ON r.snapshot=a.snapshot AND r.user=a.user WHERE a.snapshot=? AND a.result IN (0,1) AND a.start>=? AND a.start<=?${where}${player?' AND a.user=?':''}`).bind(snapshot.id,start,snapshot.cutoff,...(player?[player]:[])).first<{n:number}>();
 return Response.json({seasons,season,snapshot:snapshot.id,cutoff:snapshot.cutoff,meta:JSON.parse(snapshot.meta),progress,...summarize(rows.results,profiles,granularity,player as any,count?.n||0),window:range,scope,granularity,stale:now()-snapshot.created>3*3600},{headers:{'Cache-Control':'public,max-age=60,stale-while-revalidate=300'}});
 }catch(e){console.error('stats',e);return Response.json({error:'统计暂时无法读取，请稍后重试。'},{status:503});}}
