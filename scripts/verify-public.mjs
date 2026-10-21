import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';

const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn';
async function request(path,method='GET'){
 let last;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const response=await fetch(new URL(path,origin),{method,headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
   const body=await response.text();
   if([409,502,503,504].includes(response.status))throw new Error('HTTP '+response.status);
   let json;try{json=JSON.parse(body);}catch{throw new Error('Expected JSON at '+path+'; got '+response.status+' '+response.headers.get('content-type'));}
   return {status:response.status,body,json};
  }catch(error){last=error;if(attempt<3)await new Promise(done=>setTimeout(done,10000));}
 }
 throw last;
}
const m=await request('/data/index.json?verify='+Date.now());assert.equal(m.status,200);
const manifest=m.json,seeds=new Map(),checks=[];
assert.equal(manifest.automation.enabled,true);
for(const entry of manifest.snapshots){
 assert.equal(entry.meta.scanned,entry.meta.players);assert.equal(entry.meta.missing,0);
 const response=await request(entry.file);assert.equal(response.status,200);
 assert.equal(createHash('sha256').update(response.body).digest('hex'),entry.sha256);
 seeds.set(entry.snapshot,response.json);
 for(const changes of [{},{gapMax:'100',gapDirection:'stronger'}]){
  const q=new URLSearchParams({season:String(entry.season.id),snapshot:entry.snapshot,...changes});
  const actual=await request('/api/stats?'+q);assert.equal(actual.status,200);
  const expected=await querySnapshot('/api/stats',q,manifest,async e=>seeds.get(e.snapshot));
  for(const field of ['overview','matrix','usage','funnel'])assert.deepEqual(actual.json[field],expected[field],field);
  for(const field of ['matchups','gapTiers','mapMatchups'])assert.deepEqual(actual.json.analytics[field],expected.analytics[field],field);
  const detail=await request('/api/matches?'+q);assert.equal(detail.status,200);
  assert.equal(detail.json.total,expected.overview.games);
  assert.ok(detail.json.matches.every(row=>typeof row.match==='string'&&[0,1].includes(row.result)));
  checks.push({season:entry.season.id,snapshot:entry.snapshot,query:q.toString(),games:expected.overview.games,uniqueMatches:expected.overview.uniqueMatches});
 }
}
assert.ok(manifest.snapshots.length>=2);
const invalid=await request('/api/stats?gapMin=200&gapMax=100');assert.equal(invalid.status,400);
const write=await request('/api/stats','POST');assert.equal(write.status,405);
const result={at:new Date().toISOString(),origin,publicApiVerified:true,automation:manifest.automation,checks,invalidFilterStatus:400,writeDeniedStatus:405};
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/public-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
