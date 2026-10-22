import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
const seeds=await Promise.all([31,30].map(async n=>JSON.parse(await readFile(new URL('../shared/data/season-'+n+'.json',import.meta.url),'utf8'))));
const manifest={snapshots:seeds.map(seed=>({...seed,file:'fixture',created:seed.cutoff})),progress:null};
const load=async entry=>seeds.find(s=>s.snapshot===entry.snapshot);
process.env.YURI_DATA_DIR=resolve('.runtime-test/parity-'+process.pid);
const baseline=await import('../collector/baseline.mjs');
let state;do{state=await baseline.bootstrapStep();}while(state.state!=='complete');
after(()=>baseline.env.DB.close());

test('new snapshot queries match the established SQLite API for 96 filter combinations',async()=>{
 let checked=0;
 for(const seed of seeds)for(const range of ['season','7d','30d'])for(const opponents of ['all','top100'])for(const group of ['faction','country'])for(const player of [null,...seed.players.slice(0,3).map(p=>p.id)]){
   const q=new URLSearchParams({season:String(seed.season.id),range,opponents,group});if(player)q.set('player',player);
   const actual=await querySnapshot('/api/stats',q,manifest,load);
   const response=await baseline.stats(new Request('http://localhost/api/stats?'+q));assert.equal(response.status,200);
   const expected=await response.json();
   for(const key of ['overview','players','selected','matrix','usage','groups','window','scope','granularity'])assert.deepEqual(actual[key],expected[key],String(q)+' '+key);
   checked++;
 }
 assert.equal(checked,96);
});
test('matrix drilldown preserves string IDs, perspective counts and 30-row pagination',async()=>{
 const q=new URLSearchParams({season:'31',opponents:'top100',own:'allied',enemy:'soviet'});
 const stats=await querySnapshot('/api/stats',q,manifest,load);
 const cell=stats.matrix.find(m=>m.own==='allied'&&m.enemy==='soviet');
 const first=await querySnapshot('/api/matches',q,manifest,load);
 assert.equal(first.total,cell.games);assert.ok(first.matches.every(m=>typeof m.match==='string'&&m.result!==2));
 q.set('offset','30');const second=await querySnapshot('/api/matches',q,manifest,load);
 const keys=new Set([...first.matches,...second.matches].map(m=>m.match+':'+m.user));
 assert.equal(keys.size,first.matches.length+second.matches.length);
});
test('duplicate games, draws, invalid outcomes, zero samples and double top100 appearances',async()=>{
 const p=(id,rank)=>({id,rank,name:id});
 const game={id:'9223372036854775807',season:1,start:100,map:'测试',players:[{id:'1',country:0,result:1},{id:'2',country:5,result:0}]};
 const seed={season:{id:1,start:0,end:200},snapshot:'big-id',cutoff:200,players:[p('1',1),p('2',2),p('3',3)],matches:[game,game,{...game,id:'draw',players:game.players.map(p=>({...p,result:2}))},{...game,id:'invalid',players:game.players.map(p=>({...p,result:3}))}],meta:{scanned:3,missing:0}};
 const index={snapshots:[seed]},get=async()=>seed;
 const stats=await querySnapshot('/api/stats',new URLSearchParams({opponents:'top100'}),index,get,200);
 assert.equal(stats.overview.games,2);assert.equal(stats.overview.uniqueMatches,1);assert.equal(stats.overview.wins,1);assert.equal(stats.overview.draws,0);assert.equal(stats.overview.winRate,50);
 assert.equal(stats.players[2].total.winRate,null);
 const own=await querySnapshot('/api/matches',new URLSearchParams({player:'1'}),index,get,200);
 assert.equal(own.matches[0].match,game.id);assert.equal(own.total,1);
});
test('invalid filters fail and matrix links can pin a retained complete snapshot',async()=>{
 await assert.rejects(()=>querySnapshot('/api/stats',new URLSearchParams('player=nope'),manifest,load),{status:400});
 await assert.rejects(()=>querySnapshot('/api/matches',new URLSearchParams('own=bad'),manifest,load),{status:400});
 await assert.rejects(()=>querySnapshot('/api/stats',new URLSearchParams('player=999999999'),manifest,load),{status:404});
 await assert.rejects(()=>querySnapshot('/api/matches',new URLSearchParams('snapshot=expired'),manifest,load),{status:409});
 const index={snapshots:[{...manifest.snapshots[0],snapshot:'new'}],previous:[manifest.snapshots[0]]};
 const result=await querySnapshot('/api/matches',new URLSearchParams({snapshot:seeds[0].snapshot}),index,load);
 assert.equal(result.snapshot,seeds[0].snapshot);
});

test('match detail names use the pinned snapshot and recent match sources without mutating raw records',async()=>{
 const game=(id,start,other,name)=>({id,start,map:'昵称验收',players:[{id:'1',country:6,result:1},{id:other,...(name?{name}:{}),country:9,result:0}]});
 const seed={season:{id:1,start:0,end:300},snapshot:'names',cutoff:300,players:[{id:'1',name:'己方',rank:1},{id:'2',name:'榜单对手昵称',rank:2}],matches:[game('a',100,'2'),game('b',110,'3'),game('c',120,'3','来源旧昵称'),game('d',130,'3','来源新昵称'),game('e',140,'4')],meta:{scanned:2,missing:0}};
 const rows=(await querySnapshot('/api/matches',new URLSearchParams({player:'1'}),{snapshots:[seed]},async()=>seed)).matches;
 assert.equal(rows.find(r=>r.match==='a').game.players[1].name,'榜单对手昵称');assert.equal(rows.find(r=>r.match==='b').game.players[1].name,'来源新昵称');assert.equal(rows.find(r=>r.match==='e').game.players[1].name,undefined);assert.equal(seed.matches[0].players[1].name,undefined);
});
