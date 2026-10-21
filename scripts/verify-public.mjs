import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {querySnapshot} from '../shared/lib/snapshot-query.mjs';

const origin=process.env.YURI_VERIFY_ORIGIN||'https://yuri-ladder.cn';
async function request(path,method='GET',ready=null){
 let last;
 for(let attempt=0;attempt<6;attempt++){
  try{
   const url=new URL(path,origin);if(url.pathname.startsWith('/api/'))url.searchParams.set('_verify',Date.now()+'-'+attempt);
   const response=await fetch(url,{method,headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
   const body=await response.text();
   if([409,502,503,504].includes(response.status))throw new Error('HTTP '+response.status);
   let json;try{json=JSON.parse(body);}catch{throw new Error('Expected JSON at '+path+'; got '+response.status+' '+response.headers.get('content-type'));}
   const result={status:response.status,body,json};if(ready&&!ready(result))throw new Error('New API version is not ready at '+path+'; HTTP '+response.status);
   return result;
  }catch(error){last=error;if(attempt<5)await new Promise(done=>setTimeout(done,10000));}
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
 // Verify both new research APIs against the same published snapshot.
 const player=response.json.players.find(p=>response.json.matches.some(m=>m.players.some(v=>v.id===p.id)))?.id||response.json.players[0].id;
 const personalQ=new URLSearchParams({season:String(entry.season.id),snapshot:entry.snapshot,player});
 const personal=await request('/api/stats?'+personalQ,'GET',r=>r.status===200&&!!r.json.analytics?.opponents);assert.equal(personal.status,200);
 const dossier=personal.json.analytics.opponents;assert.ok(dossier);
 assert.equal(dossier.rows.reduce((n,r)=>n+r.total.games,0),personal.json.overview.games);
 assert.equal(dossier.bands.reduce((n,r)=>n+r.games,0),personal.json.overview.games);
 if(dossier.rows.length){const rival=dossier.rows[0];const detailQ=new URLSearchParams(personalQ);detailQ.set('opponent',rival.id);const matches=await request('/api/matches?'+detailQ);assert.equal(matches.status,200);assert.equal(matches.json.total,rival.total.games);assert.ok(matches.json.matches.every(m=>m.user===player&&m.opponent===rival.id));}
 assert.ok(entry.history,'completed source sync must publish a ranking history');
 const archive=await request(entry.history.file);assert.equal(archive.status,200);assert.equal(createHash('sha256').update(archive.body).digest('hex'),entry.history.sha256);
 const history=await request('/api/history?'+personalQ,'GET',r=>r.status===200&&r.json.available);assert.equal(history.status,200);assert.equal(history.json.snapshot,entry.snapshot);assert.ok(history.json.available);
 const summaryQ=new URLSearchParams({season:String(entry.season.id),snapshot:entry.snapshot,summary:'1'}),summary=await request('/api/history?'+summaryQ,'GET',r=>r.status===200&&Array.isArray(r.json.players));assert.equal(summary.status,200);assert.ok(summary.json.players.some(p=>p.id===player));assert.equal(summary.json.snapshot,entry.snapshot);
 assert.ok(history.json.points.length>0);assert.ok(history.json.points.every(p=>p.at<=history.json.asOf&&(p.status==='ranked'||p.rank===null&&p.mmr===null)));
 const rows=archive.json.observations.filter(o=>o.at<=history.json.asOf);assert.equal(history.json.points.length,rows.length);
 const last=rows.at(-1),expectedRank=last.players.find(p=>p[0]===player);assert.equal(history.json.points.at(-1).rank,expectedRank?.[1]??null);assert.equal(history.json.points.at(-1).mmr,expectedRank?.[2]??null);
 checks.push({type:'player-research',season:entry.season.id,player,opponents:dossier.opponents,historyPoints:history.json.points.length,firstObserved:history.json.firstObserved});
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
 assert.equal((await request('/api/history?player=bad')).status,400);assert.equal((await request('/api/history','POST')).status,405);
const result={at:new Date().toISOString(),origin,publicApiVerified:true,automation:manifest.automation,checks,invalidFilterStatus:400,writeDeniedStatus:405};
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/public-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
