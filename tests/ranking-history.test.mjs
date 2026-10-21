import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {SQLiteDatabase} from '../src/sqlite.mjs';
import {recordRanking,captureRankingHistory} from '../src/ranking-history.mjs';
import {saveCheckpoint,restoreCheckpoint} from '../src/checkpoint.mjs';
import {writePublication} from '../src/publication.mjs';
const players=[{id:'9223372036854775807',rank:1,mmr:4000}],season={id:1,name:'测试',start:0,end:200};
const seed={season,snapshot:'s1',created:500,cutoff:200,players,matches:[],meta:{scanned:1,players:1,missing:0}};
const database=()=>{const db=new SQLiteDatabase(':memory:');db.migrate(resolve('migrations'));return db;};
async function folder(){await mkdir(resolve('.runtime-test'),{recursive:true});return mkdtemp(resolve('.runtime-test/ranking-history-'));}
test('thin ranking archive survives removal of full snapshots and a fresh checkpoint database',async()=>{
 const a=database(),dir=await folder();recordRanking(a,{snapshot:'s1',season:1,observed:500,players});recordRanking(a,{snapshot:'s1',season:1,observed:999,players});
 assert.equal(a.connection.prepare('SELECT COUNT(*) AS n FROM ranking_history').get().n,1);
 await saveCheckpoint(a,dir);a.close();const b=database();await restoreCheckpoint(b,dir);
 assert.equal(b.connection.prepare('SELECT observed FROM ranking_history').get().observed,500);
 assert.equal(JSON.parse(b.connection.prepare('SELECT data FROM ranking_history').get().data)[0][0],players[0].id);b.close();
});
test('old checkpoints upgrade without a history file; corrupt new history cannot overwrite a database',async()=>{
 const a=database(),dir=await folder();await saveCheckpoint(a,dir);const m=JSON.parse(await readFile(join(dir,'checkpoint.json'),'utf8'));delete m.files['ranking_history.ndjson'];await writeFile(join(dir,'checkpoint.json'),JSON.stringify(m));
 const b=database();assert.equal(await restoreCheckpoint(b,dir),true);
 recordRanking(b,{snapshot:'kept',season:1,observed:500,players});await saveCheckpoint(b,dir);
 await writeFile(join(dir,'ranking_history.ndjson'),'corrupt');await assert.rejects(()=>restoreCheckpoint(b,dir),/校验失败/);
 assert.equal(b.connection.prepare('SELECT COUNT(*) AS n FROM ranking_history').get().n,1);a.close();b.close();
});
test('legacy archive names can be recovered without rewriting historical scores or timestamps',()=>{
 const db=database();db.connection.prepare('INSERT INTO ranking_history VALUES (?,?,?,?)').run('old',1,500,JSON.stringify([[players[0].id,1,4000]]));
 recordRanking(db,{snapshot:'old',season:1,observed:999,players:[{...players[0],name:'原榜单昵称',mmr:9999}]});
 const row=db.connection.prepare('SELECT * FROM ranking_history').get();assert.equal(row.observed,500);assert.deepEqual(JSON.parse(row.data),[[players[0].id,1,4000,'原榜单昵称']]);db.close();
});
test('published histories are immutable, use actual capture times after season end, and stay pinned on failed sync',async()=>{
 const db=database(),dir=await folder();recordRanking(db,{snapshot:'s1',season:1,observed:500,players});recordRanking(db,{snapshot:'future',season:1,observed:700,players});
 const archive=db.connection.prepare('SELECT * FROM ranking_history').all();const before=await writePublication(dir,[seed],{state:'complete'},{enabled:true},archive);
 assert.ok(before.snapshots[0].history);const body=JSON.parse(await readFile(join(dir,'history',before.snapshots[0].history.file.split('/').at(-1)),'utf8'));
 assert.equal(body.observations.length,1);assert.equal(body.observations[0].at,500);assert.notEqual(body.observations[0].at,season.end);
 const after=await writePublication(dir,[{...seed,snapshot:'half'}],{state:'retry'},undefined,archive);assert.deepEqual(after.snapshots[0],before.snapshots[0]);
 const fresh=database();await captureRankingHistory(fresh,dir);assert.equal(fresh.connection.prepare('SELECT COUNT(*) AS n FROM ranking_history').get().n,1);
 assert.equal(recordRanking(db,{snapshot:'bad',season:1,observed:500,players:[...players,...players]}),false);db.close();fresh.close();
});
