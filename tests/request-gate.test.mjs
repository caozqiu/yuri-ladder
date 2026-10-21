import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestGate} from '../shared/lib/request-gate.mjs';
test('two workers reserve separate request slots and an idle interval resets the gate',async()=>{
 let now=1000;const delays=[];
 const gate=createRequestGate(2000,()=>now,async ms=>{delays.push(ms);});
 await Promise.all([gate(),gate(),gate()]);assert.deepEqual(delays,[2000,4000]);
 now=20000;await gate();assert.deepEqual(delays,[2000,4000]);
 await gate();assert.deepEqual(delays,[2000,4000,2000]);
});
