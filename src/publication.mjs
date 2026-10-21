import {mkdir,readFile,writeFile,rename,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function validateSeed(seed){
  if(!seed.players.length||seed.players.length>100||seed.meta.missing||seed.meta.scanned!==seed.players.length)throw new Error('完整度核对失败');
  seed.players.sort((a,b)=>a.rank-b.rank);
  if(new Set(seed.players.map(p=>p.id)).size!==seed.players.length||seed.players.some((p,i)=>typeof p.id!=='string'||p.rank!==i+1))throw new Error('榜单核对失败');
  if(new Set(seed.matches.map(m=>m.id)).size!==seed.matches.length)throw new Error('比赛有重复');
  for(const m of seed.matches){
    if(typeof m.id!=='string'||m.season!==seed.season.id||m.players.length!==2||m.players.some(p=>typeof p.id!=='string'||![0,1,2].includes(p.result)))throw new Error('比赛格式核对失败');
  }
}
export async function writePublication(directory,seeds,progress=null,automation={enabled:false},rankingHistory=[]){
  await mkdir(join(directory,'snapshots'),{recursive:true});
  let previous=null;
  try{previous=JSON.parse(await readFile(join(directory,'index.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const incomplete=progress&&progress.state!=='complete'&&progress.state!=='idle';
  const entries=[];
  if(!previous||!incomplete){
    for(const seed of seeds){
      validateSeed(seed);
      const body=JSON.stringify(seed),sha256=createHash('sha256').update(body).digest('hex');
      const file='/data/snapshots/'+sha256+'.json';
      await writeFile(join(directory,'snapshots',sha256+'.json'),body);
      const entry={season:seed.season,snapshot:seed.snapshot,cutoff:seed.cutoff,created:seed.created||seed.cutoff,meta:seed.meta,file,sha256};
      const observations=rankingHistory.filter(r=>r.season===seed.season.id&&r.observed<=entry.created).map(r=>({snapshot:r.snapshot,at:r.observed,players:typeof r.data==='string'?JSON.parse(r.data):r.data}));
      if(observations.length){
       const historyBody=JSON.stringify({format:1,season:seed.season.id,snapshot:seed.snapshot,asOf:entry.created,observations}),historySha=createHash('sha256').update(historyBody).digest('hex');
       await mkdir(join(directory,'history'),{recursive:true});await writeFile(join(directory,'history',historySha+'.json'),historyBody);
       entry.history={snapshot:seed.snapshot,file:'/data/history/'+historySha+'.json',sha256:historySha,observations:observations.length};
      }
      entries.push(entry);
    }
  }
  const snapshots=incomplete&&previous?previous.snapshots:entries;
  const current=new Set(snapshots.map(s=>s.snapshot));
  const history=[...(previous?.snapshots||[]),...(previous?.previous||[])].filter(s=>!current.has(s.snapshot));
  const seen=new Set();
  const manifest={format:1,snapshots,previous:history.filter(s=>{if(seen.has(s.snapshot))return false;seen.add(s.snapshot);return true;}).slice(0,4),progress:progress?{state:progress.state,stage:progress.phase,done:progress.playersDone||0,total:progress.totalPlayers||0,...(progress.error?{error:progress.error}:{})}:null,automation};
  await writeFile(join(directory,'index.json.tmp'),JSON.stringify(manifest,null,2)+'\n');
  await rename(join(directory,'index.json.tmp'),join(directory,'index.json'));
  // Thin records are durable in SQLite/checkpoints; public assets only need
  // histories referenced by the current and retained complete publications.
  const retained=new Set([...manifest.snapshots,...manifest.previous].flatMap(e=>e.history?[e.history.file.split('/').at(-1)]:[]));
  try{for(const name of await readdir(join(directory,'history')))if(/^[a-f0-9]{64}\.json$/.test(name)&&!retained.has(name))await unlink(join(directory,'history',name));}catch(e){if(e.code!=='ENOENT')console.warn('历史静态文件清理延后');}
  return manifest;
}
