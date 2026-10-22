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
 let failRank=true,failMatch=true;
 globalThis.__rosterSource=async path=>{
  const url=new URL(path,'https://official.test');calls.push(url);
  if(url.pathname.endsWith('/seasons'))return seasons;
  const sid=Number(url.searchParams.get('seasonId')),base=sid*1000;
  if(url.pathname.endsWith('/rank')){
   const page=Number(url.searchParams.get('pageNum'));
   if(sid===11&&page===2&&failRank){failRank=false;throw Error('temporary ranking outage');}
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
  assert.equal(db.connection.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE status='complete'").get().n,0);
  const checkpoint=join(dir,'state');await saveCheckpoint(db,checkpoint);db.close();db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));await restoreCheckpoint(db,checkpoint);globalThis.__rosterDB=db;
  assert.equal((await sync.startSync()).resumed,true);
  let status=await sync.syncStatus(),failed=false;
  for(let step=0;status.state!=='complete'&&step<300;step++){
   try{status=await sync.syncStep();}catch(e){assert.match(e.message,/match outage/);failed=true;status=await sync.syncStatus();assert.equal(status.state,'retry');}
  }
  assert.equal(failed,true);assert.equal(status.state,'complete');assert.equal(status.playersDone,252);assert.equal(status.totalPlayers,252);
  for(const sid of [11,10]){
   const snapshot=db.connection.prepare('SELECT value FROM site_config WHERE key=?').get('active:'+sid).value;
   const meta=JSON.parse(db.connection.prepare('SELECT meta FROM snapshots WHERE id=?').get(snapshot).meta);
   assert.equal(meta.roster,'all');assert.equal(meta.officialPlayers,126);assert.equal(meta.scanned,126);
   assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM rankings WHERE snapshot=?').get(snapshot).n,126);
   assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM games WHERE snapshot=?').get(snapshot).n,1);
  }
  const requested=new Set(calls.filter(u=>u.pathname.endsWith('/list')).map(u=>u.searchParams.get('userId')));assert.equal(requested.size,252);
  assert.equal(calls.filter(u=>u.pathname.endsWith('/rank')&&u.searchParams.get('pageNum')==='1').length,2,'resume must not restart already-saved rank page');
  assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM pending').get().n,0);
 }finally{db.close();delete globalThis.__rosterDB;delete globalThis.__rosterSource;}
});
