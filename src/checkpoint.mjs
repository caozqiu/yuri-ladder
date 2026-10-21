import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const tables={seasons:'id',snapshots:'id',rankings:'snapshot,user',games:'snapshot,match',pending:'snapshot,match,user',sync_jobs:'id',site_config:'key',ranking_history:'season,observed,snapshot'};
const digest=s=>createHash('sha256').update(s).digest('hex');
export async function saveCheckpoint(db,directory){
  await mkdir(directory,{recursive:true});
  const files={};
  for(const [table,order]of Object.entries(tables)){
    const rows=db.connection.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
    const body=rows.map(row=>JSON.stringify({...row,...(row.data?{data:JSON.parse(row.data)}:{})})).join('\n')+'\n';
    const name=table+'.ndjson';await writeFile(join(directory,name+'.tmp'),body);await rename(join(directory,name+'.tmp'),join(directory,name));
    files[name]={sha256:digest(body),rows:rows.length};
  }
  const body=JSON.stringify({version:1,files},null,2)+'\n';
  await writeFile(join(directory,'checkpoint.json.tmp'),body);await rename(join(directory,'checkpoint.json.tmp'),join(directory,'checkpoint.json'));
}
export async function restoreCheckpoint(db,directory){
  let manifest;
  try{manifest=JSON.parse(await readFile(join(directory,'checkpoint.json'),'utf8'));}
  catch(e){if(e.code==='ENOENT')return false;throw e;}
  if(manifest.version!==1)throw new Error('不支持的同步进度格式');
  const contents=[];
  for(const table of Object.keys(tables)){
    // The first upgrade accepts old checkpoints without the new history table.
    if(table==='ranking_history'&&!manifest.files['ranking_history.ndjson']){contents.push([table,[]]);continue;}
    const name=table+'.ndjson',body=await readFile(join(directory,name),'utf8');
    if(digest(body)!==manifest.files[name]?.sha256)throw new Error('同步进度校验失败：'+name);
    const rows=body.trim()?body.trim().split('\n').map(line=>JSON.parse(line)):[];
    if(rows.length!==manifest.files[name].rows)throw new Error('同步进度行数不一致');
    contents.push([table,rows]);
  }
  db.connection.exec('BEGIN IMMEDIATE');
  try{
    db.connection.exec('DELETE FROM appearances');
    for(const [table,rows]of contents){
      db.connection.exec(`DELETE FROM ${table}`);
      for(const row of rows){
        const keys=Object.keys(row),values=keys.map(k=>k==='data'?JSON.stringify(row[k]):row[k]);
        if(keys.some(k=>!/^[a-z_]+$/.test(k)))throw new Error('无效进度字段');
        db.connection.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...values);
        if(table==='games'){
          const m=row.data;
          for(const [i,p]of m.players.entries()){
            const enemy=m.players[1-i];
            db.connection.prepare('INSERT INTO appearances(snapshot,match,user,opponent,country,enemy,result,start,map) VALUES (?,?,?,?,?,?,?,?,?)').run(row.snapshot,m.id,p.id,enemy.id,p.country,enemy.country,p.result,m.start,m.map);
          }
        }
      }
    }
    // A checkpoint is taken after a step releases its lease. Expired leases
    // from an abruptly stopped runner cannot block the next independent job.
    db.connection.prepare("DELETE FROM site_config WHERE key='sync_lock'").run();
    db.connection.exec('COMMIT');return true;
  }catch(e){db.connection.exec('ROLLBACK');throw e;}
}
