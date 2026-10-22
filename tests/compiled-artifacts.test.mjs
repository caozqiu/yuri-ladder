import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {hasEmbeddedOwnerSecret,sanitizeCompiledZip} from '../scripts/compiled-artifacts.mjs';
test('shareable compiler artifacts strip injected owner secrets while keeping source references',async()=>{
 const zip=new JSZip();zip.file('edge-functions/index.js','const context={env:{"SPONSOR_ADMIN_PASSWORD":"fixture-only-owner-secret","EDGEONE_PROJECT_ID":"existing"}}; const secret=env.SPONSOR_ADMIN_PASSWORD;');zip.file('assets/index.html','site');
 const result=await sanitizeCompiledZip(await zip.generateAsync({type:'nodebuffer'})),clean=await JSZip.loadAsync(result.bytes),code=await clean.file('edge-functions/index.js').async('string');
 assert.equal(result.removed,1);assert.equal(hasEmbeddedOwnerSecret(code),false);assert.ok(!code.includes('fixture-only-owner-secret'));assert.ok(code.includes('env.SPONSOR_ADMIN_PASSWORD'));assert.ok(code.includes('"EDGEONE_PROJECT_ID":"existing"'));assert.ok(clean.file('上传说明.txt'));
});
test('missing expected compiled owner configuration fails packaging for manual review',async()=>{
 const zip=new JSZip();zip.file('edge-functions/index.js','no environment object');await assert.rejects(sanitizeCompiledZip(await zip.generateAsync({type:'nodebuffer'})),/review required/);
});
