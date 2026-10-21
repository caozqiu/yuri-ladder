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
  assert.equal(stats.analytics.maps.reduce((n,m)=>n+m.total.games,0),stats.overview.games);
  assert.equal(stats.analytics.trend.points.reduce((n,p)=>n+p.total.games,0),stats.overview.games);
  const compared=await(await fetch(origin+'/api/stats?compare='+stats.players.slice(0,2).map(p=>p.id).join(','))).json();
  assert.equal(compared.analytics.comparisons.length,2);assert.equal(compared.analytics.headToHead.length,1);
  const map=stats.analytics.maps[0];
  const mapStats=await(await fetch(origin+'/api/stats?map='+encodeURIComponent(map.name))).json();
  assert.equal(mapStats.overview.games,map.total.games);
  const tier=stats.analytics.tiers.mmr.find(t=>t.total.games);
  const tierStats=await(await fetch(origin+'/api/stats?segment='+encodeURIComponent(tier.key))).json();
  assert.equal(tierStats.overview.games,tier.total.games);assert.equal(tierStats.players.length,tier.players);
  const scoreStats=await(await fetch(origin+'/api/stats?gapMax=200&minSamples=20')).json();
  const scoreMatches=await(await fetch(origin+'/api/matches?gapMax=200')).json();
  assert.equal(scoreStats.coverage.matched,scoreStats.overview.games);
  assert.equal(scoreStats.coverage.before,scoreStats.coverage.matched+scoreStats.coverage.excludedUnknown+scoreStats.coverage.excludedByScore);
  assert.equal(scoreMatches.total,scoreStats.overview.games);
  assert.ok(scoreMatches.matches.every(m=>m.ownMmr!==null&&m.opponentMmr!==null&&Math.abs(m.scoreGap)<=200));
  assert.equal((await fetch(origin+'/api/stats?gapMin=300&gapMax=100')).status,400);
  const matches=await(await fetch(origin+'/api/matches?season='+stats.season.id)).json();assert.ok(matches.total>0);assert.ok(matches.matches.every(m=>m.result===0||m.result===1));
  assert.equal((await fetch(origin+'/api/stats',{method:'POST'})).status,405);
  for(const path of ['/api/sync','/api/admin','/mcp','/collector/collector.mjs','/state/checkpoint.json'])assert.equal((await fetch(origin+path)).status,404,path);
 }finally{process.kill();await once(process,'exit');}
});
