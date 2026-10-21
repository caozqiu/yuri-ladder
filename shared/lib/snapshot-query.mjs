import {summarize, windowStart, faction} from './core.mjs';

export class QueryError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
const prepared=new WeakMap();
function prepare(seed){
  if(prepared.has(seed))return prepared.get(seed);
  const profiles=new Map(seed.players.map(p=>[p.id,p]));
  const seen=new Set(),rows=[];
  for(const game of seed.matches){
    if(seen.has(game.id))continue;
    seen.add(game.id);
    if(game.players.length!==2||!game.players.every(p=>p.result===0||p.result===1)||game.players[0].result+game.players[1].result!==1)continue;
    game.players.forEach((p,i)=>{
      if(!profiles.has(p.id))return;
      const enemy=game.players[1-i];
      rows.push({match:game.id,user:p.id,opponent:enemy.id,country:p.country,enemy:enemy.country,result:p.result,start:game.start,map:game.map,profile:profiles.get(p.id),game});
    });
  }
  const result={profiles,rows};prepared.set(seed,result);return result;
}
function playerFilter(q){
  const p=q.get('player');
  if(p&&!/^\d{1,20}$/.test(p))throw new QueryError('选手编号无效');
  return p||null;
}
function countryFilter(value,group){
  if(!value)return ()=>true;
  if(group==='country'&&/^\d$/.test(value))return n=>n===Number(value);
  if(['allied','soviet','yuri'].includes(value))return n=>faction(n)===value;
  throw new QueryError('无效的阵营筛选');
}
export async function querySnapshot(path,q,manifest,load,now=Math.floor(Date.now()/1000)){
  if(!['/api/stats','/api/matches'].includes(path))throw new QueryError('接口不存在',404);
  const seasons=manifest.snapshots.map(s=>s.season).sort((a,b)=>b.id-a.id);
  const season=seasons.find(s=>s.id===Number(q.get('season')))||seasons[0];
  if(!season)throw new QueryError('尚无完整数据',503);
  const pinned=q.get('snapshot');
  const entry=[...manifest.snapshots,...(manifest.previous||[])].find(s=>s.season.id===season.id&&(!pinned||s.snapshot===pinned));
  if(!entry)throw new QueryError('这批数据已更新，请刷新后重试',409);
  const seed=await load(entry);
  if(seed.snapshot!==entry.snapshot)throw new QueryError('数据批次不一致，请刷新后重试',503);
  const {profiles,rows}=prepare(seed),player=playerFilter(q);
  if(player&&!profiles.has(player))throw new QueryError('该选手不在所选赛季的前100名中',404);
  const range=['7d','30d'].includes(q.get('range'))?q.get('range'):'season';
  const scope=q.get('opponents')==='top100'?'top100':'all';
  const granularity=q.get('group')==='country'?'country':'faction';
  const start=windowStart(season,entry.cutoff,range);
  const filtered=rows.filter(r=>r.start>=start&&r.start<=entry.cutoff&&(scope!=='top100'||profiles.has(r.opponent)));
  if(path==='/api/stats'){
    const counts=new Map();
    for(const r of filtered){
      const key=r.user+':'+r.country+':'+r.enemy;
      if(!counts.has(key))counts.set(key,{user:r.user,country:r.country,enemy:r.enemy,wins:0,losses:0});
      counts.get(key)[r.result===1?'wins':'losses']++;
    }
    const uniqueMatches=new Set(filtered.filter(r=>!player||r.user===player).map(r=>r.match)).size;
    return {seasons,season,snapshot:entry.snapshot,cutoff:entry.cutoff,meta:entry.meta,progress:manifest.progress||null,
      ...summarize([...counts.values()],seed.players,granularity,player,uniqueMatches),window:range,scope,granularity,
      stale:now-(season.end<=now?entry.created:entry.cutoff)>10800,automation:manifest.automation||{enabled:false}};
  }
  const own=countryFilter(q.get('own'),granularity),enemy=countryFilter(q.get('enemy'),granularity);
  const matches=filtered.filter(r=>(!player||r.user===player)&&own(r.country)&&enemy(r.enemy))
    .sort((a,b)=>b.start-a.start||b.match.localeCompare(a.match)||a.user.localeCompare(b.user));
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(q.get('offset'))||0)));
  return {matches:matches.slice(offset,offset+30),total:matches.length,offset,snapshot:entry.snapshot};
}
