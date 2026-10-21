export const RATING_FIELDS=['mmrMin','mmrMax','enemyMmrMin','enemyMmrMax','gapMin','gapMax'];
const names={mmrMin:'己方最低积分',mmrMax:'己方最高积分',enemyMmrMin:'对手最低积分',enemyMmrMax:'对手最高积分',gapMin:'最小分差',gapMax:'最大分差',minSamples:'最低样本数'};
export function parseRatingFilters(q){
  const values={};
  for(const key of [...RATING_FIELDS,'minSamples']){
    const raw=q.get(key),max=key==='minSamples'?10000:100000;
    if(raw===null||raw===''){values[key]=key==='minSamples'?0:null;continue;}
    if(!/^\d{1,6}$/.test(raw)||Number(raw)>max)throw new Error(`${names[key]}须为0至${max}的整数`);
    values[key]=Number(raw);
  }
  for(const [min,max,name] of [['mmrMin','mmrMax','己方积分'],['enemyMmrMin','enemyMmrMax','对手积分'],['gapMin','gapMax','分差']]){
    if(values[min]!==null&&values[max]!==null&&values[min]>values[max])throw new Error(`${name}下限不能大于上限`);
  }
  const direction=q.get('gapDirection')||'any';
  if(!['any','stronger','weaker'].includes(direction))throw new Error('无效的分差方向');
  return {...values,gapDirection:direction};
}
export function rating(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
const within=(value,min,max)=>(min===null||value>=min)&&(max===null||value<=max);
export function ownRatingMatches(profile,f){
  if(f.mmrMin===null&&f.mmrMax===null)return true;
  const value=rating(profile?.mmr);return value!==null&&within(value,f.mmrMin,f.mmrMax);
}
export function needsGap(f){return f.gapMin!==null||f.gapMax!==null||f.gapDirection!=='any';}
export function needsOpponentRating(f){return f.enemyMmrMin!==null||f.enemyMmrMax!==null||needsGap(f);}
export function missingRequiredRating(row,f){
  return (needsOpponentRating(f)&&row.opponentMmr===null)||(needsGap(f)&&row.ownMmr===null);
}
export function opponentRatingMatches(row,f){
  if(missingRequiredRating(row,f))return false;
  if((f.enemyMmrMin!==null||f.enemyMmrMax!==null)&&!within(row.opponentMmr,f.enemyMmrMin,f.enemyMmrMax))return false;
  if(!needsGap(f))return true;
  const delta=row.opponentMmr-row.ownMmr,gap=Math.abs(delta);
  return within(gap,f.gapMin,f.gapMax)&&(f.gapDirection!=='stronger'||delta>0)&&(f.gapDirection!=='weaker'||delta<0);
}
export function ratingCoverage(rows,f){
  const matched=rows.filter(r=>opponentRatingMatches(r,f)).length;
  const comparable=rows.filter(r=>r.ownMmr!==null&&r.opponentMmr!==null).length;
  const excludedUnknown=rows.filter(r=>missingRequiredRating(r,f)).length;
  return {basis:'ladder-snapshot',before:rows.length,matched,comparable,comparablePercent:rows.length?comparable/rows.length*100:null,excludedUnknown,excludedByScore:rows.length-matched-excludedUnknown,active:needsOpponentRating(f)};
}
export function sampleGames(player,sort){return ['allied','soviet','yuri'].includes(sort)?player.factions[sort].games:player.total.games;}
export function wilson95(value){
  const n=value.wins+value.losses;if(!n)return null;
  const z=1.959963984540054,z2=z*z,p=value.wins/n,denom=1+z2/n;
  const center=(p+z2/(2*n))/denom,margin=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/denom;
  return {low:Math.max(0,center-margin)*100,high:Math.min(1,center+margin)*100};
}
