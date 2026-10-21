import test from 'node:test';
import assert from 'node:assert/strict';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
import {reportRows} from '../shared/lib/report-csv.mjs';
import {rankingHistory,rankingSummary} from '../shared/lib/player-research.mjs';
import {presetQuery,statsQuery} from '../shared/lib/navigation.mjs';
const players=[4000,4100,4101,3900,3899].map((mmr,i)=>({id:String(i+1),rank:i+1,mmr,name:'选手'+(i+1)}));
const g=(id,b,result=1,map='A')=>({id,season:1,start:100,map,players:[{id:'1',country:0,result},{id:b,name:'来源对手'+b,country:6,result:result===2?2:1-result}]});
const big='9223372036854775807',first=g(big,'2');
const seed={season:{id:1,name:'测试',start:0,end:200},snapshot:'research',cutoff:200,created:220,players,matches:[first,first,...Array.from({length:34},(_,i)=>g('game-'+i,'2',i%2)),g('high','3'),g('near-low','4',0),g('low','5'),g('unknown','999',1,'B'),g('draw','2',2)],meta:{scanned:5,players:5,missing:0}};
const query=(q={},path='/api/stats')=>querySnapshot(path,new URLSearchParams(q),{snapshots:[seed]},async()=>seed);
test('opponent dossier partitions exact perspective counts, +/-100 boundaries and unknown ratings',async()=>{
 const data=await query({player:'1'}),d=data.analytics.opponents;
 assert.equal(d.opponents,5);assert.equal(d.rows.reduce((n,r)=>n+r.total.games,0),data.overview.games);
 assert.deepEqual(d.bands.map(b=>b.games),[1,36,1,1]);
 assert.equal(d.bands.reduce((n,b)=>n+b.games,0),data.overview.games);
 assert.equal(d.rows.find(r=>r.id==='999').mmr,null);assert.equal(d.rows.find(r=>r.id==='999').name,'来源对手999');
 assert.equal(d.rows.find(r=>r.id==='2').factions.allied.games,35);
 assert.equal((await query()).analytics.opponents,null);
});
test('opponent detail retains snapshot and filters, string IDs, pagination, and one side per duel',async()=>{
 const q={player:'1',opponent:'2',snapshot:seed.snapshot},a=await query(q,'/api/matches'),b=await query({...q,offset:'30'},'/api/matches');
 const all=[...a.matches,...b.matches];assert.equal(a.total,35);assert.equal(all.length,35);
 assert.equal(new Set(all.map(m=>m.match)).size,35);assert.ok(all.some(m=>m.match===big));assert.ok(all.every(m=>m.user==='1'&&m.opponent==='2'));
 assert.equal((await query({player:'1',map:'B'})).analytics.opponents.opponents,1);
 const filtered=await query({player:'1',gapMax:'100'});assert.equal(filtered.analytics.opponents.rows.length,2);
 assert.ok(filtered.analytics.opponents.rows.every(o=>o.scoreGap!==null&&Math.abs(o.scoreGap)<=100));
 assert.deepEqual((await query({player:'1',minSamples:'9999'})).analytics.opponents,(await query({player:'1'})).analytics.opponents);
 await assert.rejects(()=>query({opponent:'2'},'/api/matches'),{status:400});await assert.rejects(()=>query({player:'1',opponent:'bad'},'/api/matches'),{status:400});
});
test('dossier CSV has exact per-opponent and relative score totals and excludes draws',async()=>{
 const data=await query({player:'1'}),rows=reportRows(data,data.players,'test');
 for(const o of data.analytics.opponents.rows){const row=rows.find(r=>r[0]===o.name&&r[1]===o.id);assert.deepEqual(row.slice(5,9),[o.total.games,o.total.wins,o.total.losses,o.total.winRate.toFixed(2)+'%']);}
});
const history={format:1,season:1,snapshot:'research',asOf:2000000,observations:[{snapshot:'old',at:1000000,players:[['1',1,4000]]},{snapshot:'absent',at:1999000,players:[['2',1,4100]]},{snapshot:'current',at:2000000,players:[['2',1,4200],['1',2,4100]]},{snapshot:'future',at:2000001,players:[['1',1,4500]]}]};
test('ranking history uses observation times, represents known absence, and never leaks future points',()=>{
 const all=rankingHistory(history,'1');assert.deepEqual(all.points.map(p=>[p.rank,p.mmr,p.status]),[[1,4000,'ranked'],[null,null,'outside'],[2,4100,'ranked']]);
 assert.equal(all.firstObserved,1000000);assert.equal(rankingHistory(history,'1','7d').points.length,2);
 assert.equal(rankingHistory(history,'999'),null);assert.ok(all.points.every(p=>p.at<=all.asOf));
});
test('history API pins the same batch independently from all match filters and supports legacy publications',async()=>{
 const entry={...seed,history:{file:'/history.json',snapshot:'research'}};
 const q={player:'1',range:'7d',mmrMin:'99999',gapMax:'0',map:'nonexistent',snapshot:'research'};
 const result=await querySnapshot('/api/history',new URLSearchParams(q),{snapshots:[entry]},async()=>history);
 assert.equal(result.points.length,3);assert.equal(result.snapshot,'research');
 const old=await query({player:'1'},'/api/history');assert.equal(old.available,false);assert.deepEqual(old.points,[]);
 await assert.rejects(()=>querySnapshot('/api/history',new URLSearchParams({player:'999'}),{snapshots:[entry]},async()=>history),{status:404});
 await assert.rejects(()=>query({},'/api/history'),{status:400});await assert.rejects(()=>query({player:'1',historyRange:'bad'},'/api/history'),{status:400});
 await assert.rejects(()=>query({player:'1',snapshot:'old'},'/api/history'),{status:409});
 assert.equal(new URLSearchParams(presetQuery('screen=players&research=history&historyRange=7d&rival=2')).get('research'),'history');
 assert.equal(statsQuery('player=1&research=history&historyRange=7d&rival=2'),statsQuery('player=1'));
});
test('history directory retains dropped players and compares only adjacent complete observations',()=>{
 const summary=rankingSummary({...history,observations:history.observations.slice(0,2)},players);
 assert.equal(summary.players.find(p=>p.id==='1').inLatest,false);assert.equal(summary.players.find(p=>p.id==='1').name,'选手1');
 assert.deepEqual(summary.changes.entered.map(p=>p.id),['2']);assert.deepEqual(summary.changes.exited.map(p=>p.id),['1']);
 assert.equal(rankingSummary({...history,observations:[history.observations[0]]}).changes,null);
});
