import test from 'node:test';
import assert from 'node:assert/strict';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
import {parseRatingFilters,wilson95,sampleGames} from '../shared/lib/rating-filters.mjs';
import {csvCell,reportRows,makeReportCsv} from '../shared/lib/report-csv.mjs';
const players=[3500,3700,4000,4400,4800,3500].map((mmr,i)=>({id:String(i+1),name:'选手'+(i+1),rank:i+1,mmr}));
function game(id,a,b,result=1,map='地图A'){
 return {id,season:1,start:100,map,players:[{id:a,country:0,result},{id:b,country:6,result:result===2?2:1-result}]};
}
const first=game('9223372036854775807','1','2');
const seed={snapshot:'rating-test',season:{id:1,name:'赛季1',start:0,end:200},cutoff:200,created:200,players,meta:{scanned:6,players:6,missing:0},matches:[first,first,game('2','1','3',0,'地图B'),game('3','2','3'),game('4','3','4',1,'地图B'),game('5','4','999'),game('6','1','6',0,'地图B'),game('draw','2','4',2),{...game('invalid','4','5'),players:[{id:'4',country:0,result:1},{id:'5',country:6,result:1}]}]};
const index={snapshots:[seed]},load=async()=>seed;
const query=(q={},path='/api/stats')=>querySnapshot(path,new URLSearchParams(q),index,load,200);

test('custom own MMR bounds are inclusive, open ended and intersect explicit preset segments',async()=>{
 const s=await query({mmrMin:'3500',mmrMax:'3700'});
 assert.deepEqual(s.players.map(p=>p.id),['1','2','6']);assert.equal(s.overview.games,6);
 assert.equal((await query({mmrMin:'4400'})).players.length,2);
 assert.deepEqual((await query({mmrMin:'3500',mmrMax:'3500'})).players.map(p=>p.id),['1','6']);
 const empty=await query({mmrMin:'0',mmrMax:'0'});assert.equal(empty.players.length,0);assert.equal(empty.overview.winRate,null);
 assert.deepEqual((await query({segment:'mmr:4000+',mmrMax:'4100'})).players.map(p=>p.id),['3']);
 await assert.rejects(()=>query({player:'1',mmrMin:'4000'}),{status:400});
});

test('absolute gap limits preserve zero and boundary values and never coerce unknown opponent ratings to zero',async()=>{
 const all=await query();assert.equal(all.overview.games,11);assert.equal(all.overview.uniqueMatches,6);
 const s=await query({gapMax:'200'});
 assert.equal(s.overview.games,4);assert.equal(s.overview.uniqueMatches,2);assert.equal(s.overview.winRate,50);
 assert.deepEqual(s.coverage,{basis:'ladder-snapshot',before:11,matched:4,comparable:10,comparablePercent:10/11*100,excludedUnknown:1,excludedByScore:6,active:true});
 const equal=await query({gapMin:'0',gapMax:'0'});assert.equal(equal.overview.games,2);assert.equal(equal.overview.uniqueMatches,1);
 const band=await query({gapMin:'200',gapMax:'300'});assert.equal(band.overview.games,4);
 const records=await query({gapMax:'200'},'/api/matches');
 assert.equal(records.total,4);assert.ok(records.matches.every(m=>Math.abs(m.scoreGap)<=200&&m.opponentMmr!==null));
 assert.ok(records.matches.some(m=>m.match===first.id));
});

test('higher and lower opponent directions are signed, exclude equal scores and count one perspective',async()=>{
 const high=await query({gapMax:'300',gapDirection:'stronger'});
 const low=await query({gapMax:'300',gapDirection:'weaker'});
 assert.equal(high.overview.games,2);assert.equal(high.overview.wins,2);assert.equal(high.overview.uniqueMatches,2);
 assert.equal(low.overview.games,2);assert.equal(low.overview.wins,0);
 assert.equal((await query({gapMax:'0',gapDirection:'stronger'})).overview.winRate,null);
 const onlyHigh=await query({gapDirection:'stronger'});assert.equal(onlyHigh.overview.games,4);
});

test('opponent MMR ranges and personal coverage align across matrix, maps, trends and match records',async()=>{
 const q={enemyMmrMin:'4000',enemyMmrMax:'4400'};
 const s=await query(q);assert.equal(s.overview.games,4);
 assert.equal(s.analytics.maps.reduce((n,m)=>n+m.total.games,0),4);
 assert.equal(s.analytics.trend.points.reduce((n,p)=>n+p.total.games,0),4);
 assert.equal(s.matrix.reduce((n,c)=>n+c.games,0),4);
 const records=await query(q,'/api/matches');assert.equal(records.total,4);
 assert.ok(records.matches.every(m=>m.opponentMmr>=4000&&m.opponentMmr<=4400));
 const personal=await query({player:'1',gapMax:'200'});
 assert.deepEqual([personal.coverage.before,personal.coverage.matched,personal.coverage.excludedByScore],[3,2,1]);
 assert.equal(personal.overview.games,personal.coverage.matched);
});

test('combined map, own range, opponent range and gap filters also constrain pair comparisons',async()=>{
 const s=await query({map:'地图A',mmrMin:'3500',mmrMax:'4000',enemyMmrMin:'3500',enemyMmrMax:'4000',gapMin:'200',gapMax:'300',compare:'1,2,3'});
 assert.equal(s.overview.games,4);assert.equal(s.overview.uniqueMatches,2);
 assert.deepEqual(s.analytics.comparisons.map(p=>p.total.games),[1,2,1]);
 assert.equal(s.analytics.headToHead.find(p=>p.a==='1'&&p.b==='2').total.games,1);
 assert.equal(s.analytics.headToHead.find(p=>p.a==='1'&&p.b==='3').total.winRate,null);
 const tier=await query({mmrMin:'4400',gapMax:'300'});
 assert.deepEqual(tier.analytics.tiers,(await query({gapMax:'300'})).analytics.tiers,'tier comparison ignores single own range but respects the gap');
});

test('missing own ratings exclude only the conditions that require them',async()=>{
 const custom={...seed,snapshot:'unknown-own',players:players.map(p=>p.id==='1'?{...p,mmr:null}:p)};
 const i={snapshots:[custom]},fetch=async()=>custom;
 const a=await querySnapshot('/api/stats',new URLSearchParams({player:'1',enemyMmrMin:'0'}),i,fetch,200);
 assert.equal(a.overview.games,3);
 const b=await querySnapshot('/api/stats',new URLSearchParams({player:'1',gapMax:'9999'}),i,fetch,200);
 assert.equal(b.overview.games,0);assert.equal(b.coverage.excludedUnknown,3);
});

test('invalid numeric ranges, non-integers, extreme values and directions return useful 400 errors',async()=>{
 for(const q of [{mmrMin:'5000',mmrMax:'4000'},{enemyMmrMin:'2',enemyMmrMax:'1'},{gapMin:'201',gapMax:'200'},{gapMax:'-1'},{gapMax:'NaN'},{mmrMin:'3e3'},{gapMax:'100.5'},{gapMax:'100001'},{minSamples:'10001'},{gapDirection:'invalid'}])await assert.rejects(()=>query(q),{status:400});
 const f=parseRatingFilters(new URLSearchParams({mmrMin:'0',gapMax:'0',minSamples:'0'}));
 assert.equal(f.mmrMin,0);assert.equal(f.gapMax,0);assert.equal(f.minSamples,0);
});

test('minimum samples are presentation metadata and faction sorting uses that faction sample size',async()=>{
 const a=await query(),b=await query({minSamples:'20'});
 assert.deepEqual(b.overview,a.overview);assert.deepEqual(b.players,a.players);assert.deepEqual(b.matrix,a.matrix);
 assert.equal(b.filters.minSamples,20);
 const p={total:{games:100},factions:{allied:{games:2},soviet:{games:98},yuri:{games:0}}};
 assert.equal(sampleGames(p,'allied'),2);assert.equal(sampleGames(p,'win'),100);
});

test('Wilson 95 percent intervals handle no samples, all wins and all losses without false certainty',()=>{
 assert.equal(wilson95({wins:0,losses:0}),null);
 const one=wilson95({wins:1,losses:0}),many=wilson95({wins:100,losses:0}),zero=wilson95({wins:0,losses:1});
 assert.ok(Math.abs(one.low-20.6549314)<1e-5);assert.ok(Math.abs(zero.high-79.3450686)<1e-5);
 assert.ok(many.low>96&&many.high===100);assert.ok(one.high-one.low>many.high-many.low);
 const balanced=wilson95({wins:50,losses:50});assert.ok(Math.abs(balanced.low+balanced.high-100)<1e-10);
});

test('CSV preserves applied zero gaps, sample coverage and confidence intervals and escapes formula prefixes',async()=>{
 const s=await query({gapMax:'0'}),rows=reportRows(s,s.players,'截止时间');
 const meta=rows.find(r=>r[0]==='精细筛选');assert.equal(meta[meta.indexOf('gapMax')+1],0);
 assert.ok(rows.some(r=>r.includes('未知积分排除')));assert.ok(rows.some(r=>r.includes('95%下界')));
 assert.ok(makeReportCsv(s,s.players,'时间').startsWith('\uFEFF'));
 for(const unsafe of ['=1+1','\t=SUM(A1)',' +1','\r@SUM(A1)'])assert.ok(csvCell(unsafe).startsWith('"\''));
 assert.equal(csvCell('a"b'),'"a""b"');
 const high=await query({minSamples:'100'});assert.equal(reportRows(high,[],'时间').filter(r=>r[0]==='地图A').length,0);
});
