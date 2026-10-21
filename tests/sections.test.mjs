import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
import {reportRows} from '../shared/lib/report-csv.mjs';
import {currentScreen,presetQuery,parsePresets,statsQuery} from '../shared/lib/navigation.mjs';
const players=[4000,4000,4100,4101,4200,4201,4300,4301,4500,4501].map((mmr,i)=>({id:String(i+1),name:'P'+i,rank:i+1,mmr}));
const g=(id,a,b,c=6)=>({id,season:1,start:100,map:'地图'+(Number(b)%2),players:[{id:a,country:0,result:1},{id:b,country:c,result:0}]});
const first=g('9223372036854775807','1','2');
const seed={season:{id:1,start:0,end:200,name:'测试'},snapshot:'test-sections',cutoff:200,players,matches:[first,first,...players.slice(2).map(p=>g('g'+p.id,'1',p.id)),g('unknown','1','999'),g('mirror','1','2',1),{...g('draw','1','2'),players:first.players.map(p=>({...p,result:2}))},{...g('invalid','1','2'),players:first.players.map(p=>({...p,result:1}))}],meta:{scanned:10,players:10,missing:0}};
const query=(q={},path='/api/stats',custom=seed)=>querySnapshot(path,new URLSearchParams(q),{snapshots:[custom]},async()=>custom,200);
test('gap tiers assign all inclusive boundaries once, exclude mirrors and disclose unknown scores',async()=>{
 const data=await query();
 assert.deepEqual(data.analytics.gapTiers.map(t=>t.games),[4,4,4,4,2]);
 assert.equal(data.analytics.crossSummary.games,19);assert.equal(data.analytics.crossSummary.unknownGap,1);
 assert.equal(data.analytics.gapTiers.reduce((n,t)=>n+t.games,0)+data.analytics.crossSummary.unknownGap,19);
 assert.equal(data.analytics.matchups[0].uniqueMatches,10);
 for(const tier of data.analytics.gapTiers)assert.equal(Object.values(tier.factions).reduce((n,c)=>n+c.games,0),tier.games);
});
test('asymmetric filters retain independent directional denominators and exact matchup drilldowns',async()=>{
 const q={gapDirection:'stronger',gapMax:'500'};const data=await query(q);
 const pair=data.analytics.matchups[0];assert.equal(pair.directions[0].games,7);assert.equal(pair.directions[1].games,0);
 assert.equal(pair.directions[0].winRate,100);assert.equal(pair.directions[1].winRate,null);
 for(const d of pair.directions){const records=await query({...q,own:d.own,enemy:d.enemy},'/api/matches');assert.equal(records.total,d.games);assert.equal(d.wins+d.losses,d.games);}
 assert.equal(data.funnel.at(-1).games,data.overview.games);
 for(let i=1;i<data.funnel.length;i++)assert.ok(data.funnel[i].games<=data.funnel[i-1].games);
});
test('heatmap, directional cards, CSV and snapshot-pinned detail counts agree with no draw leakage',async()=>{
 const q={mmrMin:'4000',mmrMax:'4200'},data=await query(q);
 for(const map of data.analytics.mapMatchups)for(const d of map.cells){
  const result=await query({...q,map:map.name,own:d.own,enemy:d.enemy,snapshot:seed.snapshot},'/api/matches');
  assert.equal(result.total,d.games);assert.equal(result.matches.filter(m=>m.result===1).length,d.wins);
  assert.equal(d.wins+d.losses,d.games);assert.ok(result.matches.every(m=>typeof m.match==='string'));
 }
 const csv=reportRows(data,data.players,'测试');
 for(const pair of data.analytics.matchups)for(const d of pair.directions){const r=csv.find(r=>r[0]===d.own+' → '+d.enemy);assert.deepEqual(r.slice(1,5),[d.uniqueMatches,d.games,d.wins,d.losses]);}
 assert.equal(data.analytics.matchups[1].directions[0].winRate,null);
 const limited=await query({...q,minSamples:'9999'});assert.deepEqual(limited.analytics,data.analytics);
});
test('funnel distinguishes base, personal cohort, missing required scores and match results',async()=>{
 const data=await query({player:'1',gapMax:'100'});
 assert.deepEqual(data.funnel.map(s=>s.games),[21,11,10,3]);
 assert.equal(data.funnel.at(-1).uniqueMatches,data.overview.uniqueMatches);
 assert.equal(data.ratingOptions.min,4000);assert.equal(data.ratingOptions.max,4600);
});
test('legacy views migrate while saved schemes exclude pagination, detail and snapshot state',()=>{
 const q=v=>new URLSearchParams(v);
 assert.equal(currentScreen(q('view=maps')),'maps');assert.equal(currentScreen(q('view=trend')),'trends');assert.equal(currentScreen(q('view=tiers')),'matchups');assert.equal(currentScreen(q('player=1')),'players');
 assert.equal(currentScreen(q('screen=overview&player=1')),'overview');assert.equal(currentScreen(q(''),'#matrix'),'matchups');
 const value=presetQuery('view=maps&gapMin=0&gapMax=100&snapshot=old&own=allied&enemy=yuri&offset=30&detailMap=map');
 assert.equal(q(value).get('screen'),'maps');assert.equal(q(value).get('gapMin'),'0');
 for(const k of ['view','snapshot','own','enemy','offset','detailMap'])assert.equal(q(value).has(k),false);
 assert.deepEqual(parsePresets('invalid'),[]);assert.deepEqual(parsePresets('{}'),[]);
 assert.equal(parsePresets(JSON.stringify([{id:'1',name:'方案',query:value},{id:3,name:'bad',query:''}])).length,1);
 assert.equal(statsQuery('screen=maps&own=allied&gapMax=100&view=maps'),statsQuery('gapMax=100&screen=trends'));
});
test('real snapshots match all six directions and map cells across both seasons and asymmetric filters',async()=>{
 let checked=0;
 for(const id of [31,30]){
  const raw=JSON.parse(await readFile(new URL('../shared/data/season-'+id+'.json',import.meta.url),'utf8'));
  for(const q of [{},{gapMax:'100'},{mmrMin:'4000',gapDirection:'weaker'},{opponents:'top100',range:'7d'}]){
   const stats=await query(q,'/api/stats',raw);
   for(const pair of stats.analytics.matchups)for(const d of pair.directions){const r=await query({...q,own:d.own,enemy:d.enemy},'/api/matches',raw);assert.equal(r.total,d.games);checked++;}
   assert.equal(stats.analytics.mapMatchups.reduce((n,m)=>n+m.games,0),stats.analytics.crossSummary.games);
   for(const m of stats.analytics.mapMatchups)assert.equal(m.cells.reduce((n,c)=>n+c.games,0),m.games);
  }
 }
 assert.equal(checked,48);
});
