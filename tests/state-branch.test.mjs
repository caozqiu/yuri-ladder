import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const helper=resolve('scripts/state-branch.mjs');
function run(exe,args,cwd){const r=spawnSync(exe,args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;}
test('checkpoint branch survives a fresh clone and preserves cursor without changing main',{skip:process.platform==='win32'?'Local sandbox blocks Git MSYS named objects; this integration runs on the Linux CI runner.':false},async()=>{
 await mkdir('.runtime-test',{recursive:true});const root=await mkdtemp(resolve('.runtime-test/remote-'));
 const origin=join(root,'origin.git'),first=join(root,'first'),second=join(root,'second');
 run('git',['init','--bare',origin],root);run('git',['init','-b','main',first],root);
 run('git',['config','user.name','Fixture'],first);run('git',['config','user.email','fixture@example.invalid'],first);
 await writeFile(join(first,'README.md'),'source stays on main\n');run('git',['add','README.md'],first);run('git',['commit','-m','source'],first);
 run('git',['remote','add','origin',origin],first);run('git',['push','-u','origin','main'],first);
 const before=run('git',['rev-parse','HEAD'],first);
 run(process.execPath,[helper,'restore'],first);
 await mkdir(join(first,'.checkpoint/state'),{recursive:true});await mkdir(join(first,'.checkpoint/public'),{recursive:true});
 await writeFile(join(first,'.checkpoint/state/cursor.json'),'{"run":"same-run","token":"next-page"}');
 await writeFile(join(first,'.checkpoint/public/index.json'),'{"snapshot":"last-complete"}');
 run(process.execPath,[helper,'save'],first);assert.equal(run('git',['rev-parse','HEAD'],first),before);
 run('git',['clone','--branch','main',origin,second],root);run(process.execPath,[helper,'restore'],second);
 assert.equal(JSON.parse(await readFile(join(second,'.checkpoint/state/cursor.json'),'utf8')).token,'next-page');
 assert.equal(JSON.parse(await readFile(join(second,'.checkpoint/public/index.json'),'utf8')).snapshot,'last-complete');
});
