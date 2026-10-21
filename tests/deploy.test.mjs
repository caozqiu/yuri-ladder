import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {publishExisting,PROJECT_ID} from '../scripts/deploy.mjs';
test('publishing resolves the existing project ID before using its actual name and region',async()=>{
 const seen=[],logs=[],makers={projects:{get:async q=>{seen.push(q);return {projectId:PROJECT_ID,name:'actual-existing-name',area:'overseas'};}}};
 await publishExisting({makers,token:'fixture-only',invoke:async(args,options)=>seen.push(args,options),log:value=>logs.push(value)});
 assert.deepEqual(seen[0],{projectId:PROJECT_ID});
 assert.equal(seen[1][seen[1].indexOf('--name')+1],'actual-existing-name');
 assert.equal(seen[1][seen[1].indexOf('--area')+1],'overseas');
 assert.ok(seen[1].includes('--skip-ai-gateway-sync'));assert.ok(!logs.join('').includes('fixture-only'));
 assert.equal(seen[1][seen[1].indexOf('deploy')+1],'--name','explicit upload folders bypass function compilation');
 assert.equal(seen[2].cwd,resolve('dist'),'compile only the public artifact, never the private collector');
 seen.length=0;await publishExisting({makers,token:'fixture-only',checkOnly:true,invoke:async()=>assert.fail('preflight must not deploy'),log:()=>{}});assert.equal(seen.length,1);
});
test('missing credentials, identity mismatch and invalid projects never start a deployment',async()=>{
 const invoke=async()=>assert.fail('must not deploy'),base={token:'fixture-only',invoke,log:()=>{}};
 await assert.rejects(()=>publishExisting({...base,token:'',makers:{}}),/missing/);
 for(const project of [{projectId:'other',name:'valid-name'},{projectId:PROJECT_ID,name:'bad/name'},{projectId:PROJECT_ID,name:'valid-name',area:'mainland'}]){
  await assert.rejects(()=>publishExisting({...base,makers:{projects:{get:async()=>project}}}));
 }
});
