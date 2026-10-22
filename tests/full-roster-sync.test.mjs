import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SQLiteDatabase} from '../src/sqlite.mjs';
import {saveCheckpoint,restoreCheckpoint} from '../src/checkpoint.mjs';
test('hourly collector resumes ranking and match cursors, scans every ranked player and publishes only complete seasons',async()=>{
 await mkdir('.runtime-test',{recursive:true});const dir=await mkdtemp(resolve('.runtime-test/full-roster-'));
 const sourceCode=await readFile('shared/lib/source.ts','utf8');
 const bundle=await build({entryPoints:['shared/lib/sync.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-official-source',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={get DB(){return globalThis.__rosterDB}};'}));
  b.onLoad({filter:/[\\/]shared[\\/]lib[\\/]source\.ts$/},()=>({contents:'export async function source(path){return globalThis.__rosterSource(path);}\n'+sourceCode.slice(sourceCode.indexOf('export async function twoAtOnce')),loader:'ts'}));
 }}]});
 const module=join(dir,'sync.mjs');await writeFile(module,bundle.outputFiles[0].contents);const sync=await import(pathToFileURL(module));
 let db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));globalThis.__rosterDB=db;
 const calls=[],at=Math.floor(Date.now()/1000),seasons=[{seasonId:11,seasonName:'本季',startTime:at-10000,endTime:at+10000},{seasonId:10,seasonName:'上季',startTime:at-20000,endTime:at-10000}];
 // Upgrade a real legacy top-100 shape without forcing a weekly full rescan.
 for(const season of seasons){
  const sid=season.seasonId,id='legacy:'+sid,cutoff=Math.min(at-1000,season.endTime);
  db.connection.prepare('INSERT INTO seasons VALUES (?,?,?,?)').run(sid,season.seasonName,season.startTime,season.endTime);
  db.connection.prepare('INSERT INTO snapshots VALUES (?,?,?,?,?,?)').run(id,sid,cutoff,at-1000,'complete',JSON.stringify({scanned:100,players:100,missing:0}));
  for(let rank=1;rank<=100;rank++){const p={id:String(sid*1000+rank),name:'旧榜单'+rank,rank,mmr:5000-rank};db.connection.prepare('INSERT INTO rankings VALUES (?,?,?,?)').run(id,p.id,rank,JSON.stringify(p));}
  db.connection.prepare('INSERT INTO site_config VALUES (?,?)').run('active:'+sid,id);
 }
 db.connection.prepare('INSERT INTO site_config VALUES (?,?)').run('last_full',String(at));
 let failRank=true,failMatch=true,driftRank=true;
 globalThis.__rosterSource=async path=>{
  const url=new URL(path,'https://official.test');calls.push(url);
  if(url.pathname.endsWith('/seasons'))return seasons;
  const sid=Number(url.searchParams.get('seasonId')),base=sid*1000;
  if(url.pathname.endsWith('/rank')){
   const page=Number(url.searchParams.get('pageNum'));
   if(sid===11&&page===2&&failRank){failRank=false;throw Error('temporary ranking outage');}
   if(sid===11&&page===2&&driftRank){driftRank=false;return {page,count:127,totalPages:6,list:Array.from({length:25},(_,i)=>({userId:String(base+26+i),username:'changed',userLevel:{rank:26+i,mmr:4000}}))};}
   return {page,count:126,totalPages:6,list:Array.from({length:Math.min(25,126-(page-1)*25)},(_,i)=>{const rank=(page-1)*25+i+1;return {userId:String(base+rank),username:'P'+rank,userLevel:{rank,mmr:5000-rank}};})};
  }
  if(url.pathname.endsWith('/list')){
   const user=Number(url.searchParams.get('userId'));
   if(user===11101&&failMatch){failMatch=false;throw Error('temporary match outage');}
   if(user!==base+1&&user!==base+2)return {list:[],nextToken:''};
   return {list:[{matchId:'92233720368547758'+sid,userId:String(user),gameType:4,gameVersion:0,playerCount:2,single:false,country:user===base+1?0:6,status:user===base+1?1:0,playerIds:[String(base+1),String(base+2)],startTime:sid===11?at-100:at-11000,mapName:'测试地图'}],nextToken:url.searchParams.get('nextToken')?'':'second-page'};
  }
  throw Error('Unexpected summary fetch: both player observations must merge');
 };
 try{
  await sync.startSync();await sync.syncStep();await assert.rejects(()=>sync.syncStep(),/ranking outage/);
  assert.equal((await sync.syncStatus()).state,'retry');
  assert.equal(db.connection.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE status='complete'").get().n,2);
  assert.equal(db.connection.prepare("SELECT value FROM site_config WHERE key='active:11'").get().value,'legacy:11');
  const checkpoint=join(dir,'state');await saveCheckpoint(db,checkpoint);db.close();db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));await restoreCheckpoint(db,checkpoint);globalThis.__rosterDB=db;
  assert.equal((await sync.startSync()).resumed,true);
  let status=await sync.syncStatus(),failed=false,countRecovered=false;
  for(let step=0;status.state!=='complete'&&step<300;step++){
   try{
    status=await sync.syncStep();
    if(status.phase==='list'){
     const work=JSON.parse(db.connection.prepare("SELECT data FROM sync_jobs WHERE state='running' ORDER BY rowid DESC LIMIT 1").get().data);
     assert.equal(work.players.find(p=>p.uid==='11101').stop,0,'newly included player must backfill entire season');
     assert.ok(work.players.find(p=>p.uid==='11001').stop>0,'existing player uses 48-hour overlap');
    }
   }catch(e){
    if(e.message.includes('来源榜单人数'))countRecovered=true;else{assert.match(e.message,/match outage/);failed=true;}
    status=await sync.syncStatus();assert.equal(status.state,'retry');
    await saveCheckpoint(db,checkpoint);db.close();db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));await restoreCheckpoint(db,checkpoint);globalThis.__rosterDB=db;
   }
  }
  assert.equal(failed,true);assert.equal(countRecovered,true);assert.equal(status.state,'complete');assert.equal(status.playersDone,252);assert.equal(status.totalPlayers,252);
  for(const sid of [11,10]){
   const snapshot=db.connection.prepare('SELECT value FROM site_config WHERE key=?').get('active:'+sid).value;
   const meta=JSON.parse(db.connection.prepare('SELECT meta FROM snapshots WHERE id=?').get(snapshot).meta);
   assert.equal(meta.roster,'all');assert.equal(meta.officialPlayers,126);assert.equal(meta.scanned,126);assert.equal(meta.full,false);
   assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM rankings WHERE snapshot=?').get(snapshot).n,126);
   assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM games WHERE snapshot=?').get(snapshot).n,1);
  }
  const requested=new Set(calls.filter(u=>u.pathname.endsWith('/list')).map(u=>u.searchParams.get('userId')));assert.equal(requested.size,252);
  assert.equal(calls.filter(u=>u.pathname.endsWith('/rank')&&u.searchParams.get('pageNum')==='1').length,3,'resume keeps the saved page; a changed official count restarts only the affected season');
  assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM pending').get().n,0);
 }finally{db.close();delete globalThis.__rosterDB;delete globalThis.__rosterSource;}
});
