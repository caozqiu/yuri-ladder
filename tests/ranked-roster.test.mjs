import test from 'node:test';
import assert from 'node:assert/strict';
import {rankingPage,validateRoster} from '../shared/lib/ranked-roster.mjs';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';
import {validateSeed} from '../src/publication.mjs';
import {recordRanking} from '../src/ranking-history.mjs';
import {SQLiteDatabase} from '../src/sqlite.mjs';
import {resolve} from 'node:path';
import {presetQuery,statsQuery} from '../shared/lib/navigation.mjs';
const players=Array.from({length:205},(_,i)=>({id:String(i+1),name:'选手'+(i+1),rank:i+1,mmr:5000-i}));
const raw=p=>({userId:p.id,username:p.name,userLevel:{rank:p.rank,mmr:p.mmr}});
const game=(id,a,b)=>({id,season:1,start:100,map:'全榜验证',players:[{id:String(a),country:0,result:1},{id:String(b),country:6,result:0}]});
const games=[game('9223372036854775807',1,101),game('b',101,102),game('c',100,101),game('d',150,9999),game('e',1,2)];
const seed={season:{id:1,start:0,end:200},snapshot:'full205',created:200,cutoff:200,players,matches:[...games,games[0],{...games[0],id:'draw',players:games[0].players.map(p=>({...p,result:2}))}],meta:{roster:'all',officialPlayers:205,scanned:205,players:205,missing:0}};
const get=(q={},path='/api/stats',custom=seed)=>querySnapshot(path,new URLSearchParams(q),{snapshots:[custom]},async()=>custom,200);
test('dynamic ranking pagination includes final partial page and rejects count drift, wrong page and duplicate users',()=>{
 const result=[];
 for(let page=1;page<=9;page++)result.push(...rankingPage({page,count:205,totalPages:9,list:players.slice((page-1)*25,page*25).map(raw)},page,205).players);
 assert.equal(validateRoster(result,205).at(-1).rank,205);
 assert.throws(()=>rankingPage({page:2,count:206,totalPages:9,list:players.slice(25,50).map(raw)},2,205));
 assert.throws(()=>rankingPage({page:1,count:205,totalPages:9,list:players.slice(25,50).map(raw)},2));
 assert.throws(()=>validateRoster([...result.slice(0,-1),{...result[0],rank:205}],205));
});
test('default top100 and explicit full roster share complete rating coverage but keep different appearance denominators',async()=>{
 const top=await get(),all=await get({roster:'all'});
 assert.equal(top.players.length,100);assert.equal(all.players.length,205);
 assert.equal(top.overview.games,4);assert.equal(top.overview.uniqueMatches,3);
 assert.equal(all.overview.games,9);assert.equal(all.overview.uniqueMatches,5);
 assert.equal(top.roster.available,205);assert.equal(top.roster.mode,'top100');
 const comparable=await get({gapMax:'200'});assert.equal(comparable.coverage.excludedUnknown,0);
 const mutual=await get({roster:'all',opponents:'top100'});assert.equal(mutual.overview.games,2);assert.equal(mutual.overview.uniqueMatches,1);
 const ranked=await get({roster:'all',opponents:'ranked'});assert.equal(ranked.overview.games,8);assert.equal(ranked.overview.uniqueMatches,4);
 const personal=await get({roster:'all',player:'101'});assert.equal(personal.selected.rank,101);assert.equal(personal.overview.games,3);
 await assert.rejects(()=>get({player:'101'}),{status:404});
 const compared=await get({roster:'all',compare:'101,150'});assert.equal(compared.analytics.comparisons.length,2);
 for(const params of [{},{roster:'all'},{roster:'all',gapMax:'1'},{roster:'all',segment:'rank:101-200'},{roster:'all',opponents:'top100'}]){
  const stats=await get(params),detail=await get(params,'/api/matches');
  assert.equal(stats.overview.games,detail.total);assert.equal(stats.overview.wins+stats.overview.losses,detail.total);
  assert.equal(stats.analytics.maps.reduce((n,m)=>n+m.total.games,0),detail.total);
  assert.equal(stats.matrix.reduce((n,m)=>n+m.games,0),detail.total);
 }
 assert.equal((await get({roster:'all',segment:'rank:101-200'})).players.length,100);
});
test('full roster publication and ranking history accept over 100 only when the declared official coverage is complete',async()=>{
 const clean={...seed,matches:games};validateSeed(clean);assert.throws(()=>validateSeed({...clean,meta:{...seed.meta,officialPlayers:500}}),/完整度/);
 const db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));
 try{assert.equal(recordRanking(db,{snapshot:seed.snapshot,season:1,observed:200,players}),true);assert.equal(JSON.parse(db.connection.prepare('SELECT data FROM ranking_history').get().data).length,205);}finally{db.close();}
 const legacy={...seed,players:players.slice(0,100),meta:{scanned:100,players:100,missing:0}};
 assert.equal((await get({},'/api/stats',legacy)).roster.complete,false);
 await assert.rejects(()=>get({roster:'all'},'/api/stats',legacy),{status:409});
 const query='screen=players&roster=all&player=101&offset=30&snapshot=old';
 assert.equal(new URLSearchParams(presetQuery(query)).get('roster'),'all');assert.ok(statsQuery(query).includes('roster=all'));
});
