import test from 'node:test';
import assert from 'node:assert/strict';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
import {trend} from '../shared/lib/analytics.mjs';
import {parseFavorites,toggleFavorite} from '../shared/lib/favorites.mjs';

const time=s=>Date.parse(s)/1000;
const start=time('2026-10-01T00:00:00+08:00'),cutoff=time('2026-10-08T23:59:59+08:00');
const players=[['1',1,1999],['2',11,2000],['3',26,3999],['4',51,4000],['5',10,2999],['6',25,3000]].map(([id,rank,mmr])=>({id,rank,mmr,name:'选手'+id}));
const game=(id,a,b,when=start,map='A地图',result=1)=>({id,season:1,start:when,map,players:[{id:a,country:0,result},{id:b,country:6,result:result===2?2:1-result}]});
const first=game('9223372036854775807','1','2');
const seed={season:{id:1,name:'测试赛季',start,end:cutoff},snapshot:'analytics-test',cutoff,created:cutoff,meta:{scanned:6,players:6,missing:0},players,matches:[first,first,game('2','1','2',start+86400,'B地图',0),game('3','2','3',start+86400,'A地图'),game('4','4','999',cutoff,'B地图'),game('5','1','4',start+86400,'A地图',2),game('6','1','2',start-1),game('7','1','2',cutoff+1)]};
const manifest={snapshots:[seed]},load=async()=>seed;
const query=(params={},path='/api/stats')=>querySnapshot(path,new URLSearchParams(params),manifest,load,cutoff+1);

test('map totals, faction breakdowns and comparison records exclude draws, duplicates and out-of-window games',async()=>{
 const stats=await query({compare:'1,2,3,4',player:'1'});
 assert.equal(stats.overview.games,2);
 assert.deepEqual(stats.analytics.maps.map(m=>[m.name,m.total.wins,m.total.losses,m.uniqueMatches]),[['A地图',1,0,1],['B地图',0,1,1]]);
 const [a,b,c,d]=stats.analytics.comparisons;
 assert.deepEqual([a.total.games,a.total.winRate,b.total.games,b.total.wins,c.total.games,d.total.games],[2,50,3,2,1,1]);
 const duel=stats.analytics.headToHead.find(p=>p.a==='1'&&p.b==='2');
 assert.deepEqual([duel.total.wins,duel.total.losses,duel.uniqueMatches],[1,1,2]);
 assert.equal(stats.analytics.headToHead.find(p=>p.a==='1'&&p.b==='4').total.winRate,null);
 const overall=await query();
 assert.equal(overall.overview.games,7);assert.equal(overall.overview.uniqueMatches,4);
 assert.equal(overall.analytics.maps.reduce((n,m)=>n+m.total.games,0),7);
 assert.equal(overall.analytics.maps.find(m=>m.name==='A地图').uniqueMatches,2);
 assert.deepEqual(overall.mapOptions,['A地图','B地图']);
});

test('map and snapshot-point segments apply consistently to summaries, comparisons and match pages',async()=>{
 const filtered=await query({map:'A地图',segment:'mmr:2000-2999',compare:'2,5'});
 assert.deepEqual(filtered.players.map(p=>p.id),['5','2']);
 assert.equal(filtered.overview.games,2);assert.equal(filtered.overview.wins,1);
 assert.equal(filtered.analytics.comparisons[1].total.winRate,null);
 const matches=await query({map:'A地图',segment:'mmr:2000-2999'},'/api/matches');
 assert.equal(matches.total,2);assert.ok(matches.matches.every(m=>m.map==='A地图'&&m.user==='2'));
 const big=matches.matches.find(m=>m.match===first.id);assert.equal(big.match,'9223372036854775807');
 assert.equal((await query({map:'无样本地图'})).overview.winRate,null);
 const top=await query({opponents:'top100'});assert.equal(top.overview.games,6);assert.equal(top.overview.winRate,50);
});

test('tier membership uses inclusive snapshot MMR and rank boundaries and preserves appearance weighting',async()=>{
 const stats=await query();
 assert.deepEqual(stats.analytics.tiers.mmr.map(t=>t.players),[1,2,2,1]);
 assert.deepEqual(stats.analytics.tiers.rank.map(t=>t.players),[2,2,1,1,0,0,0]);
 for(const type of ['mmr','rank']){
  const groups=stats.analytics.tiers[type];
  assert.equal(groups.reduce((n,t)=>n+t.total.games,0),stats.overview.games);
  assert.equal(groups.reduce((n,t)=>n+t.total.wins,0),stats.overview.wins);
  assert.equal(groups.reduce((n,t)=>n+t.players,0),players.length);
 }
 const filtered=await query({player:'1',segment:'mmr:0-1999'});
 assert.deepEqual(filtered.analytics.tiers,stats.analytics.tiers,'tier comparison remains the complete top100 cohort');
 assert.equal(stats.analytics.tiers.mmr[1].total.winRate,2/3*100);
 await assert.rejects(()=>query({segment:'mmr:invalid'}),{status:400});
 await assert.rejects(()=>query({segment:'mmr:4000+',player:'1'}),{status:400});
});

test('comparison validates string IDs, season membership and the four-player limit',async()=>{
 assert.equal((await query({compare:'1,1,2'})).analytics.comparisons.length,2);
 await assert.rejects(()=>query({compare:'1,2,3,4,5'}),{status:400});
 await assert.rejects(()=>query({compare:'1,999'}),{status:404});
 await assert.rejects(()=>query({compare:'1,<script>'}),{status:400});
});

test('trend buckets follow Beijing midnight and Monday, preserve gaps and weight all games',()=>{
 const begin=time('2026-10-03T00:00:00+08:00'),end=time('2026-10-06T23:59:59+08:00');
 const row=(when,id,result)=>({start:time(when),match:id,result,country:0});
 const rows=[row('2026-10-03T23:59:59+08:00','1',1),row('2026-10-04T00:00:00+08:00','2',0),row('2026-10-06T00:00:00+08:00','3',1)];
 const daily=trend(rows,begin,end);
 assert.deepEqual(daily.points.map(p=>p.label),['2026-10-03','2026-10-04','2026-10-05','2026-10-06']);
 assert.deepEqual(daily.points.map(p=>p.total.winRate),[100,0,null,100]);
 assert.equal(daily.points[2].factions.yuri.winRate,null);
 const weekly=trend(rows,begin,end,'week');
 assert.deepEqual(weekly.points.map(p=>p.label),['2026-09-28','2026-10-05']);
 assert.deepEqual(weekly.points.map(p=>p.total.winRate),[50,100]);
 assert.equal(weekly.points[1].end,end);
});

test('completed-season recent windows anchor to the dataset cutoff and zero-sample dates stay empty',async()=>{
 const stats=await querySnapshot('/api/stats',new URLSearchParams({range:'7d',player:'1'}),manifest,load,cutoff+90*86400);
 assert.equal(stats.analytics.trend.points.at(-1).label,'2026-10-08');
 assert.equal(stats.overview.games,1);
 assert.equal(stats.analytics.trend.points.at(-1).total.winRate,null);
});

test('favorites handle corrupt storage and unsafe values, retain exact IDs and toggle independently of season',()=>{
 for(const raw of [null,'{','{}','null','false'])assert.deepEqual(parseFavorites(raw),[]);
 const ids=parseFavorites('["9223372036854775807","1","1",1,"<script>",null]');
 assert.deepEqual(ids,['9223372036854775807','1']);
 assert.deepEqual(toggleFavorite(ids,'1'),['9223372036854775807']);
 assert.deepEqual(toggleFavorite(ids,'2'),['9223372036854775807','1','2']);
 assert.deepEqual(toggleFavorite(ids,'bad'),ids);
});
