import {spawnSync} from 'node:child_process';
import {resolve,relative,isAbsolute} from 'node:path';
import {existsSync,writeFileSync} from 'node:fs';
const root=process.cwd(),directory=resolve('.checkpoint');
const within=relative(root,directory);
if(isAbsolute(within)||within.startsWith('..')||within!=='.checkpoint')throw new Error('进度目录必须在项目内');
function git(args,cwd=root,allow=[]){
 const r=spawnSync('git',args,{cwd,encoding:'utf8'});
 if(r.error)throw r.error;
 if(r.status!==0&&!allow.includes(r.status))throw new Error(r.stderr||'Git 操作失败');
 return r;
}
const branch='ladder-data';
if(process.argv[2]==='restore'){
 if(existsSync(directory))throw new Error('进度目录已存在，拒绝覆盖');
 const result=git(['ls-remote','--exit-code','origin','refs/heads/'+branch],root,[2]);
 if(result.status===0){
   git(['fetch','--depth=1','origin','refs/heads/'+branch]);
   git(['worktree','add','--detach',directory,'FETCH_HEAD']);
 }else{
   git(['worktree','add','--detach',directory,'HEAD']);
   // This is a newly created disposable worktree, verified to be inside root.
   git(['switch','--orphan','ladder-data-init'],directory);
   writeFileSync(resolve(directory,'README.md'),'# Ladder sync state\n\nPublic-source records and resumable pagination. This branch is updated by the hourly workflow.\n');
 }
 console.log('Checkpoint worktree ready.');
}else if(process.argv[2]==='save'){
 if(!existsSync(resolve(directory,'.git')))throw new Error('缺少进度工作树');
 git(['config','user.name','github-actions[bot]'],directory);
 git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],directory);
 git(['add','--','README.md','state','public'],directory);
 const status=git(['status','--porcelain'],directory).stdout;
 if(status.trim()){
   git(['commit','-m','Update complete data and sync checkpoint '+new Date().toISOString()],directory);
   git(['push','origin','HEAD:refs/heads/'+branch],directory);
   console.log('Checkpoint persisted.');
 }else console.log('Checkpoint unchanged.');
}else throw new Error('Usage: state-branch.mjs restore|save');
