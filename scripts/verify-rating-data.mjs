import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
const root=resolve(process.argv[2]||'dist/data');
const manifest=JSON.parse(await readFile(resolve(root,'index.json'),'utf8')),seeds=new Map();
for(const e of manifest.snapshots)seeds.set(e.snapshot,JSON.parse(await readFile(resolve(root,'snapshots',e.file.split('/').at(-1)),'utf8')));
const cases=[{}, {mmrMin:'3500',mmrMax:'4300',gapMin:'0',gapMax:'100',minSamples:'20'}, {mmrMin:'4000',enemyMmrMin:'3800',enemyMmrMax:'4700',gapMin:'200',gapMax:'500',gapDirection:'stronger'}, {gapMax:'0'}, {gapDirection:'weaker',gapMax:'300'}, {enemyMmrMin:'0'}, {mmrMin:'0',mmrMax:'0'}];
const checks=[];
for(const entry of manifest.snapshots){
 const seed=seeds.get(entry.snapshot),players=new Map(seed.players.map(p=>[p.id,p]));
 const games=[...new Map(seed.matches.map(m=>[m.id,m])).values()].filter(m=>m.players.length===2&&m.players.every(p=>p.result===0||p.result===1)&&m.players[0].result+m.players[1].result===1);
 for(const roster of entry.meta.roster==='all'?['top100','all']:['top100'])for(const range of ['season','7d','30d'])for(const opponents of ['all','top100','ranked'])for(const filter of cases){
  const from=range==='season'?entry.season.start:Math.max(entry.season.start,entry.cutoff-(range==='7d'?7:30)*86400);
  const expected=[];
  for(const game of games){
   if(game.start<from||game.start>entry.cutoff)continue;
   for(let i=0;i<2;i++){
    const own=game.players[i],enemy=game.players[1-i];
    if(!players.has(own.id)||roster==='top100'&&players.get(own.id).rank>100||opponents==='top100'&&!(players.get(own.id)?.rank<=100&&players.get(enemy.id)?.rank<=100)||opponents==='ranked'&&!players.has(enemy.id))continue;
    const a=players.get(own.id)?.mmr??null,b=players.get(enemy.id)?.mmr??null;
    if(filter.mmrMin!==undefined&&(a===null||a<Number(filter.mmrMin)))continue;
    if(filter.mmrMax!==undefined&&(a===null||a>Number(filter.mmrMax)))continue;
    if(filter.enemyMmrMin!==undefined&&(b===null||b<Number(filter.enemyMmrMin)))continue;
    if(filter.enemyMmrMax!==undefined&&(b===null||b>Number(filter.enemyMmrMax)))continue;
    if(filter.gapMin!==undefined||filter.gapMax!==undefined||filter.gapDirection){
     if(a===null||b===null)continue;
     if(filter.gapMin!==undefined&&Math.abs(a-b)<Number(filter.gapMin))continue;
     if(filter.gapMax!==undefined&&Math.abs(a-b)>Number(filter.gapMax))continue;
     if(filter.gapDirection==='stronger'&&b<=a||filter.gapDirection==='weaker'&&b>=a)continue;
    }
    expected.push({match:game.id,result:own.result});
   }
  }
  const q=new URLSearchParams({season:String(entry.season.id),roster,range,opponents,...filter});
  const stats=await querySnapshot('/api/stats',q,manifest,async e=>seeds.get(e.snapshot));
  assert.equal(stats.overview.games,expected.length,String(q));
  assert.equal(stats.overview.wins,expected.filter(p=>p.result===1).length,String(q));
  assert.equal(stats.overview.uniqueMatches,new Set(expected.map(p=>p.match)).size,String(q));
  for(const count of [stats.analytics.maps.reduce((n,m)=>n+m.total.games,0),stats.analytics.trend.points.reduce((n,p)=>n+p.total.games,0),stats.matrix.reduce((n,c)=>n+c.games,0),stats.coverage.matched])assert.equal(count,expected.length,String(q));
  assert.equal(stats.coverage.before,stats.coverage.matched+stats.coverage.excludedUnknown+stats.coverage.excludedByScore,String(q));
  checks.push({season:entry.season.id,roster,range,opponents,filter,games:expected.length,unique:stats.overview.uniqueMatches});
 }
}
const result={at:new Date().toISOString(),passed:checks.length,checks};
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:checks.length,seasons:manifest.snapshots.map(e=>e.season.id)}));
