import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('deployable artifact serves both readonly APIs and blocks public writes',async()=>{
 const process=spawn(globalThis.process.execPath,['scripts/preview.mjs'],{env:{...globalThis.process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{process.stdout.once('data',b=>{try{resolve(JSON.parse(String(b)).port);}catch(e){reject(e);}});process.once('exit',()=>reject(new Error('preview exited')));});
  const origin='http://127.0.0.1:'+port;
  assert.equal((await fetch(origin)).status,200);
  const stats=await (await fetch(origin+'/api/stats')).json();assert.equal(stats.players.length,100);assert.equal(stats.overview.draws,0);assert.ok(stats.overview.games>0);
  const matches=await(await fetch(origin+'/api/matches?season='+stats.season.id)).json();assert.ok(matches.total>0);assert.ok(matches.matches.every(m=>m.result===0||m.result===1));
  assert.equal((await fetch(origin+'/api/stats',{method:'POST'})).status,405);
  for(const path of ['/api/sync','/api/admin','/mcp','/collector/collector.mjs','/state/checkpoint.json'])assert.equal((await fetch(origin+path)).status,404,path);
 }finally{process.kill();await once(process,'exit');}
});
