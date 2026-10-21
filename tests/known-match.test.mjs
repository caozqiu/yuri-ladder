import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedKnownMatch} from '../shared/lib/known-match.mjs';
const known={id:'1585265976143433728',season:31,start:100,map:'old',players:[{id:'1',country:0,result:1},{id:'2',country:9,result:0}]};
const row={matchId:known.id,userId:1,playerIds:[1,2],country:0,status:1,startTime:100,mapName:'new',gameType:4,gameVersion:0,playerCount:2,single:false};
test('fresh own-side observation verifies an already complete opponent country',()=>{assert.deepEqual(verifiedKnownMatch([row],known,31),{...known,map:'new'});});
test('changed country, result, version, match ID or player identity requires a new summary',()=>{for(const change of [{country:2},{status:0},{status:3},{gameVersion:1},{matchId:'1585265976143433729'},{playerIds:[1,3]},{startTime:101}])assert.equal(verifiedKnownMatch([{...row,...change}],known,31),null);assert.equal(verifiedKnownMatch([row],null,31),null);});
