export const COUNTRIES = ['美国','韩国','法国','德国','英国','利比亚','伊拉克','古巴','苏俄','尤里'];
export const FACTIONS = [{key:'allied',name:'盟军',color:'#60a5fa'},{key:'soviet',name:'苏军',color:'#f87171'},{key:'yuri',name:'尤里',color:'#bd93f9'}];
export function faction(country) { return country>=0&&country<=4?'allied':country>=5&&country<=8?'soviet':country===9?'yuri':'unknown'; }
export function groups(granularity='faction') { return granularity==='country'?COUNTRIES.map((name,i)=>({key:String(i),name,color:FACTIONS.find(f=>f.key===faction(i))?.color||'#888'})):FACTIONS; }
// Keep raw draws for source auditing; published statistics count decisive games only.
export function counter(wins=0,losses=0) { const games=wins+losses; return {wins,losses,draws:0,games,winRate:games?wins/games*100:null}; }
export function add(a,b) { return counter(a.wins+b.wins,a.losses+b.losses); }
export function isCountry(n) { return Number.isInteger(n)&&n>=0&&n<10; }
export function normalizeSummary(s,season) {
  if(s.gameType!==4||s.gameVersion!==0||s.isEnd!==1||s.playerCount!==2) return null;
  const ps=(s.players||[]).filter(p=>p.colorId!==null&&p.userId>0);
  if(ps.length!==2||String(ps[0].userId)===String(ps[1].userId))return null;
  if(ps.some(p=>![0,1,2].includes(p.matchStats)))return null;
  if(!((ps[0].matchStats===2&&ps[1].matchStats===2)||(ps[0].matchStats+ps[1].matchStats===1)))return null;
  return {id:String(s.matchId),season,start:s.startTime,map:s.mapName||'未知地图',players:ps.map(p=>({id:String(p.userId),name:p.username||'',country:p.country,result:p.matchStats}))};
}
export function normalizeObservations(rows,season) {
  if(rows.length!==2)return null;
  const [a,b]=rows;
  if(a.gameType!==4||b.gameType!==4||a.gameVersion!==0||b.gameVersion!==0||a.playerCount!==2||b.playerCount!==2||a.single||b.single||String(a.userId)===String(b.userId)||String(a.matchId)!==String(b.matchId))return null;
  if(![0,1,2].includes(a.status)||![0,1,2].includes(b.status))return null;
  if(!((a.status===2&&b.status===2)||(a.status+b.status===1)))return null;
  const ids=(a.playerIds||[]).map(String);
  if(!ids.includes(String(a.userId))||!ids.includes(String(b.userId)))return null;
  return {id:String(a.matchId),season,start:a.startTime,map:a.mapName||'未知地图',players:rows.map(p=>({id:String(p.userId),country:p.country,result:p.status}))};
}
export function profile(p) { const l=p.userLevel||{};return {id:String(p.userId),name:(p.unionInfo?.prefixName?'['+p.unionInfo.prefixName+']':'')+p.username,avatar:p.avatar||'',rank:l.rank,mmr:l.mmr||0,officialTotal:l.total||0,officialWins:l.victoryTotal||0,officialLosses:l.defeatTotal||0}; }
export function windowStart(season,cutoff,range) {return range==='7d'?Math.max(season.start,cutoff-7*86400):range==='30d'?Math.max(season.start,cutoff-30*86400):season.start;}
export function summarize(rows,profiles,granularity='faction',playerId=null,uniqueMatches=0) {
  const players=new Map(profiles.map(p=>[p.id,{...p,total:counter(),factions:Object.fromEntries(FACTIONS.map(f=>[f.key,counter()]))}]));
  const matrix=new Map(),usage=new Map();let overall=counter();
  for(const row of rows){
    const c=counter(Number(row.wins),Number(row.losses));
    if(!c.games)continue;
    const p=players.get(String(row.user));
    if(p){p.total=add(p.total,c);const f=faction(row.country);if(p.factions[f])p.factions[f]=add(p.factions[f],c);}
    if(playerId&&String(row.user)!==playerId)continue;
    overall=add(overall,c);
    const own=granularity==='country'?String(row.country):faction(row.country),enemy=granularity==='country'?String(row.enemy):faction(row.enemy);
    if(isCountry(row.country))usage.set(own,add(usage.get(own)||counter(),c));
    else usage.set('unknown',add(usage.get('unknown')||counter(),c));
    if(!isCountry(row.country)||!isCountry(row.enemy))continue;
    const key=own+':'+enemy;matrix.set(key,{...add(matrix.get(key)||counter(),c),own,enemy});
  }
  const gs=groups(granularity);
  const usageGroups=usage.has('unknown')?[...gs,{key:'unknown',name:'未识别',color:'#748194'}]:gs;
  return {players:[...players.values()].sort((a,b)=>a.rank-b.rank),selected:players.get(playerId)||null,overview:{...overall,uniqueMatches},matrix:gs.flatMap(a=>gs.map(b=>matrix.get(a.key+':'+b.key)||{...counter(),own:a.key,enemy:b.key})),groups:gs,usage:usageGroups.map(g=>({...g,...(usage.get(g.key)||counter()),share:overall.games?(usage.get(g.key)?.games||0)/overall.games*100:0}))};
}
