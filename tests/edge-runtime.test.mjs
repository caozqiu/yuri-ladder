import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../src/edge-api.mjs';

test('edge runtime returns JSON errors and write denial without Response.json support',async()=>{
 const OriginalResponse=globalThis.Response,originalFetch=globalThis.fetch;
 class EdgeResponse extends OriginalResponse{static json=undefined;}
 globalThis.Response=EdgeResponse;
 try{
  const invoke=(path,method='GET')=>onRequest({request:new Request('https://fixture.example'+path,{method})});
  const denied=await invoke('/api/stats','POST');assert.equal(denied.status,405);assert.equal(denied.headers.get('allow'),'GET, HEAD');assert.ok((await denied.json()).error);
  globalThis.fetch=async()=>new EdgeResponse(JSON.stringify({snapshots:[]}));
  const unavailable=await invoke('/api/stats');assert.equal(unavailable.status,503);assert.ok((await unavailable.json()).error);
  const missing=await invoke('/api/unknown');assert.equal(missing.status,404);assert.ok((await missing.json()).error);
  assert.equal(missing.headers.get('cache-control'),'no-store');
 }finally{globalThis.Response=OriginalResponse;globalThis.fetch=originalFetch;}
});
