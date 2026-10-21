import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceJSON} from '../shared/lib/source-json.mjs';
test('unquoted large ID survives actual source JSON parsing without touching strings',()=>{const d=parseSourceJSON('{"matchId":1585265976143433728,"quoted":"1585265976143433728","name":"map 1585265976143433728 \\"x\\"","rank":100,"rate":1.5}');assert.equal(d.matchId,'1585265976143433728');assert.equal(d.name,'map 1585265976143433728 "x"');assert.equal(d.rank,100);assert.equal(d.rate,1.5);});
