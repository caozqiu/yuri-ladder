import {join,resolve} from 'node:path';
import {env} from './environment.mjs';
import {restoreCheckpoint,saveCheckpoint} from './checkpoint.mjs';
import {writePublication} from './publication.mjs';
import {bootstrapStep,bootstrapSnapshots} from '../shared/lib/bootstrap';
import {captureRankingHistory} from './ranking-history.mjs';
import {startSync,syncStep,syncStatus} from '../shared/lib/sync';
const checkpoint=resolve(process.env.YURI_CHECKPOINT_DIR||'.checkpoint/state');
const publicDirectory=resolve(process.env.YURI_PUBLIC_DATA_DIR||'.checkpoint/public');
const automation={enabled:process.env.YURI_AUTOMATION_ENABLED==='1',schedule:'每小时第55分钟（北京时间），平台调度可能延迟'};
const log=(event:string,data:any={})=>console.log(JSON.stringify({event,...data}));
async function exportPublic(){
 const rankingHistory=await captureRankingHistory(env.DB,publicDirectory,bootstrapSnapshots);
 const seasons=env.DB.connection.prepare('SELECT * FROM seasons ORDER BY id DESC LIMIT 2').all();
 const seeds=[];
 for(const season of seasons){
   const active=env.DB.connection.prepare('SELECT value FROM site_config WHERE key=?').get('active:'+season.id);
   if(!active)continue;
   const snapshot=env.DB.connection.prepare("SELECT * FROM snapshots WHERE id=? AND status='complete'").get(active.value);
   if(!snapshot)continue;
   const players=env.DB.connection.prepare('SELECT data FROM rankings WHERE snapshot=? ORDER BY rank').all(snapshot.id).map((r:any)=>JSON.parse(r.data));
   const matches=env.DB.connection.prepare('SELECT data FROM games WHERE snapshot=? ORDER BY match').all(snapshot.id).map((r:any)=>JSON.parse(r.data));
   seeds.push({season,snapshot:snapshot.id,cutoff:snapshot.cutoff,created:snapshot.created,players,matches,meta:JSON.parse(snapshot.meta)});
 }
 return writePublication(publicDirectory,seeds,await syncStatus(),automation,rankingHistory);
}
const command=process.argv[2]||'export';
let exitCode=0,ready=false;
try{
 const restored=await restoreCheckpoint(env.DB,checkpoint);log('checkpoint',{restored});
 let initial:any;do{initial=await bootstrapStep();}while(initial.state!=='complete');
 // Keep a complete publication available before starting any new staging work.
 await exportPublic();ready=true;
 if(command==='sync'||command==='step'){
   const minutes=Math.max(1,Math.min(45,Number(process.env.YURI_SYNC_MINUTES||35)));
   const deadline=Date.now()+minutes*60000;
   let savedAt=Date.now();
   let status=await startSync(process.env.YURI_FORCE_FULL==='1');log('sync_started',status);
   do{
     status=await syncStep();log('sync_progress',status);
     if(Date.now()-savedAt>5*60000){await saveCheckpoint(env.DB,checkpoint);await exportPublic();savedAt=Date.now();}
     if(command==='step')break;
   }while(status.state!=='complete'&&Date.now()<deadline);
   if(status.state!=='complete'){exitCode=75;log('sync_checkpointed',status);}
 }else if(command!=='export'&&command!=='status')throw new Error('Usage: collector.mjs export|sync|step|status');
 log('status',await syncStatus());
}catch(e:any){exitCode=1;log('sync_failed',{error:e.message});}
finally{
 try{if(ready){await captureRankingHistory(env.DB,publicDirectory,bootstrapSnapshots);await saveCheckpoint(env.DB,checkpoint);await exportPublic();}}catch(e:any){exitCode=1;log('checkpoint_failed',{error:e.message});}
 env.DB.close();process.exitCode=exitCode;
}
