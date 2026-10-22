import {isTop100} from './ranked-roster.mjs';
import {summarize, windowStart, faction} from './core.mjs';
import {buildAnalytics, inSegment, SEGMENTS} from './analytics.mjs';
import {parseRatingFilters,rating,ownRatingMatches,opponentRatingMatches,ratingCoverage,missingRequiredRating} from './rating-filters.mjs';
import {buildMatchups} from './matchup-analytics.mjs';
import {opponentDossier,rankingHistory,rankingSummary} from './player-research.mjs';

export class QueryError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
const prepared=new WeakMap();
function prepare(seed){
  if(prepared.has(seed))return prepared.get(seed);
  const profiles=new Map(seed.players.map(p=>[p.id,p]));
  const names=new Map(seed.players.filter(p=>p.name).map(p=>[p.id,p.name])),observedNames=new Map();
  for(const game of seed.matches)for(const p of game.players)if(typeof p.name==='string'&&p.name.trim()&&!names.has(p.id)&&(!observedNames.has(p.id)||observedNames.get(p.id).at<game.start))observedNames.set(p.id,{name:p.name,at:game.start});
  for(const [id,p]of observedNames)names.set(id,p.name);
  const seen=new Set(),rows=[];
  for(const original of seed.matches){
    const game={...original,players:original.players.map(p=>({...p,...(names.has(p.id)?{name:names.get(p.id)}:{})}))};
    if(seen.has(game.id))continue;
    seen.add(game.id);
    if(game.players.length!==2||!game.players.every(p=>p.result===0||p.result===1)||game.players[0].result+game.players[1].result!==1)continue;
    game.players.forEach((p,i)=>{
      if(!profiles.has(p.id))return;
      const enemy=game.players[1-i];
      const ownMmr=rating(profiles.get(p.id)?.mmr),opponentMmr=rating(profiles.get(enemy.id)?.mmr);
      rows.push({match:game.id,user:p.id,opponent:enemy.id,country:p.country,enemy:enemy.country,result:p.result,start:game.start,map:game.map,profile:profiles.get(p.id),game,ownMmr,opponentMmr,scoreGap:ownMmr!==null&&opponentMmr!==null?opponentMmr-ownMmr:null});
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
  if(!['/api/stats','/api/matches','/api/history'].includes(path))throw new QueryError('接口不存在',404);
  const seasons=manifest.snapshots.map(s=>s.season).sort((a,b)=>b.id-a.id);
  const season=seasons.find(s=>s.id===Number(q.get('season')))||seasons[0];
  if(!season)throw new QueryError('尚无完整数据',503);
  const pinned=q.get('snapshot');
  const entry=[...manifest.snapshots,...(manifest.previous||[])].find(s=>s.season.id===season.id&&(!pinned||s.snapshot===pinned));
  if(!entry)throw new QueryError('这批数据已更新，请刷新后重试',409);
  if(path==='/api/history'){
    if(q.get('summary')==='1'){
      if(!entry.history)return {available:false,season:season.id,snapshot:entry.snapshot,asOf:entry.created,observations:0,firstObserved:null,players:[],changes:null};
      const archive=await load(entry.history),seed=await load(entry);
      if(archive.snapshot!==entry.snapshot||seed.snapshot!==entry.snapshot)throw new QueryError('历史数据批次不一致，请刷新后重试',503);
      return rankingSummary(archive,seed.players);
    }
    const player=playerFilter(q);if(!player)throw new QueryError('请指定选手编号');
    const range=q.get('historyRange')||'all';if(!['all','7d','30d'].includes(range))throw new QueryError('历史周期无效');
    if(!entry.history)return {player,season:season.id,snapshot:entry.snapshot,asOf:entry.created,range,available:false,firstObserved:null,points:[],basis:'observed-ladder-snapshot'};
    const archive=await load(entry.history);
    if(archive.snapshot!==entry.snapshot||archive.season!==season.id)throw new QueryError('历史数据批次不一致，请刷新后重试',503);
    const result=rankingHistory(archive,player,range);if(!result)throw new QueryError('暂无该选手的历史榜单观察',404);
    return result;
  }
  const seed=await load(entry);
  if(seed.snapshot!==entry.snapshot)throw new QueryError('数据批次不一致，请刷新后重试',503);
  const {profiles,rows}=prepare(seed),player=playerFilter(q);
  const rosterMode=q.get('roster')||'top100';
  if(!['top100','all'].includes(rosterMode))throw new QueryError('无效的统计名单');
  const fullRoster=entry.meta?.roster==='all';
  if(rosterMode==='all'&&!fullRoster)throw new QueryError('全榜战绩仍在采集中，请先查看前100名，完整后自动开放全榜',409);
  const cohort=new Map(seed.players.filter(p=>rosterMode==='all'||isTop100(p)).map(p=>[p.id,p]));
  const roster={mode:rosterMode,available:seed.players.length,complete:fullRoster,selected:cohort.size};
  if(player&&!cohort.has(player))throw new QueryError(profiles.has(player)?'该选手在前100名以外，请切换全榜查看':'该选手不在所选赛季的完整榜单中',404);
  const range=['7d','30d'].includes(q.get('range'))?q.get('range'):'season';
  const scope=['top100','ranked'].includes(q.get('opponents'))?q.get('opponents'):'all';
  const granularity=q.get('group')==='country'?'country':'faction';
  const start=windowStart(season,entry.cutoff,range);
  const map=q.get('map')||'',segment=q.get('segment')||'';
  let ratingFilters;
  try{ratingFilters=parseRatingFilters(q);}catch(e){throw new QueryError(e.message);}
  if(map.length>300)throw new QueryError('地图名称过长');
  if(segment&&!Object.values(SEGMENTS).flat().some(s=>s.key===segment))throw new QueryError('无效的分段筛选');
  if(player&&!inSegment(profiles.get(player),segment))throw new QueryError('选手不在当前分段，请先切换到全部分段',400);
  if(player&&!ownRatingMatches(profiles.get(player),ratingFilters))throw new QueryError('选手不在当前己方积分范围，请调整积分条件或返回全部选手',400);
  const base=rows.filter(r=>cohort.has(r.user)&&r.start>=start&&r.start<=entry.cutoff&&(scope!=='top100'||isTop100(profiles.get(r.user))&&isTop100(profiles.get(r.opponent)))&&(scope!=='ranked'||profiles.has(r.opponent)));
  const mapOptions=[...new Set(base.map(r=>r.map))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const mapRows=base.filter(r=>!map||r.map===map);
  const eligible=mapRows.filter(r=>inSegment(r.profile,segment)&&ownRatingMatches(r.profile,ratingFilters));
  const cohortRows=mapRows.filter(r=>opponentRatingMatches(r,ratingFilters));
  const filtered=eligible.filter(r=>opponentRatingMatches(r,ratingFilters));
  const coverage=ratingCoverage(eligible.filter(r=>!player||r.user===player),ratingFilters);
  if(path==='/api/stats'){
    const ids=q.get('compare');
    const compare=ids?[...new Set(ids.split(','))]:[];
    if(compare.length>4||compare.some(id=>!/^\d{1,20}$/.test(id)))throw new QueryError('请选择最多4位不同选手进行对比');
    if(compare.some(id=>!cohort.has(id)))throw new QueryError('对比选手不在当前统计名单中，请切换全榜',404);
    const counts=new Map();
    for(const r of filtered){
      const key=r.user+':'+r.country+':'+r.enemy;
      if(!counts.has(key))counts.set(key,{user:r.user,country:r.country,enemy:r.enemy,wins:0,losses:0});
      counts.get(key)[r.result===1?'wins':'losses']++;
    }
    const uniqueMatches=new Set(filtered.filter(r=>!player||r.user===player).map(r=>r.match)).size;
    const personal=rs=>rs.filter(r=>!player||r.user===player);
    const stage=(key,name,rs)=>({key,name,games:rs.length,uniqueMatches:new Set(rs.map(r=>r.match)).size});
    const ownRows=personal(eligible),knownRows=ownRows.filter(r=>!missingRequiredRating(r,ratingFilters)),resultRows=personal(filtered);
    const funnel=[stage('base','基础胜负出场',mapRows),stage('own','己方范围',ownRows),stage('known','所需积分已知',knownRows),stage('matched','最终匹配',resultRows)];
    const values=[...cohort.values()].map(p=>rating(p.mmr)).filter(v=>v!==null),gaps=rows.filter(r=>r.scoreGap!==null).map(r=>Math.abs(r.scoreGap));
    const ratingOptions={min:values.length?Math.floor(Math.min(...values)/100)*100:0,max:values.length?Math.max(100,Math.ceil(Math.max(...values)/100)*100):5000,gapMax:gaps.length?Math.max(100,Math.ceil(Math.max(...gaps)/100)*100):1000};
    return {seasons,season,snapshot:entry.snapshot,cutoff:entry.cutoff,meta:entry.meta,roster,progress:manifest.progress||null,
      ...summarize([...counts.values()],[...cohort.values()].filter(p=>inSegment(p,segment)&&ownRatingMatches(p,ratingFilters)),granularity,player,uniqueMatches),window:range,scope,granularity,
      filters:{map,segment,...ratingFilters},coverage,mapOptions,funnel,ratingOptions,
      analytics:{...buildAnalytics({rows:filtered,cohortRows,profiles:cohort,player,compare,start,cutoff:entry.cutoff,bucket:q.get('bucket')==='week'?'week':'day'}),...buildMatchups(resultRows),opponents:opponentDossier(resultRows,profiles,player)},
      stale:now-(season.end<=now?entry.created:entry.cutoff)>10800,automation:manifest.automation||{enabled:false}};
  }
  const own=countryFilter(q.get('own'),granularity),enemy=countryFilter(q.get('enemy'),granularity);
  const opponent=q.get('opponent');
  if(opponent&&(!/^\d{1,20}$/.test(opponent)||!player))throw new QueryError('对手明细需要有效的己方和对手编号');
  const matches=filtered.filter(r=>(!player||r.user===player)&&(!opponent||r.opponent===opponent)&&own(r.country)&&enemy(r.enemy))
    .sort((a,b)=>b.start-a.start||b.match.localeCompare(a.match)||a.user.localeCompare(b.user));
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(q.get('offset'))||0)));
  return {matches:matches.slice(offset,offset+30),total:matches.length,offset,snapshot:entry.snapshot,ratingBasis:'ladder-snapshot'};
}
