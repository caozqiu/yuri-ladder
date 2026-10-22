import {counter, add, faction, FACTIONS} from './core.mjs';

export const SEGMENTS = {
  mmr: [
    {key:'mmr:0-1999',name:'2000 分以下',min:0,max:1999},
    {key:'mmr:2000-2999',name:'2000–2999 分',min:2000,max:2999},
    {key:'mmr:3000-3999',name:'3000–3999 分',min:3000,max:3999},
    {key:'mmr:4000+',name:'4000 分及以上',min:4000,max:Infinity},
  ],
  rank: [
    {key:'rank:1-10',name:'第 1–10 名',min:1,max:10},
    {key:'rank:11-25',name:'第 11–25 名',min:11,max:25},
    {key:'rank:26-50',name:'第 26–50 名',min:26,max:50},
    {key:'rank:51-100',name:'第 51–100 名',min:51,max:100},
    {key:'rank:101-200',name:'第 101–200 名',min:101,max:200},
    {key:'rank:201-500',name:'第 201–500 名',min:201,max:500},
    {key:'rank:501+',name:'第 501 名及以后',min:501,max:Infinity},
  ],
};
export function inSegment(profile,key){
  if(!key)return true;
  const type=key.split(':')[0],definition=SEGMENTS[type]?.find(s=>s.key===key);
  if(!definition)return false;
  const value=profile?.[type];
  return Number.isFinite(value)&&value>=definition.min&&value<=definition.max;
}
const emptyFactions=()=>Object.fromEntries(FACTIONS.map(f=>[f.key,counter()]));
function aggregate(rows){
  let total=counter();const factions=emptyFactions(),unique=new Set();
  for(const r of rows){
    const c=counter(r.result===1?1:0,r.result===0?1:0);
    total=add(total,c);unique.add(r.match);
    const f=faction(r.country);if(factions[f])factions[f]=add(factions[f],c);
  }
  return {total,factions,uniqueMatches:unique.size};
}
const DAY=86400,BEIJING=8*3600;
function dayStart(time){return Math.floor((time+BEIJING)/DAY)*DAY-BEIJING;}
function bucketStart(time,bucket){
  const day=dayStart(time);
  return bucket==='week'?day-((Math.floor((day+BEIJING)/DAY)+3)%7)*DAY:day;
}
export function trend(rows,start,cutoff,bucket='day'){
  const step=bucket==='week'?7*DAY:DAY,points=new Map();
  // Fill empty dates, but never turn a no-sample date into a zero-percent win rate.
  for(let t=bucketStart(start,bucket);t<=cutoff;t+=step){
    points.set(t,{start:t,end:Math.min(t+step-1,cutoff),label:new Date((t+BEIJING)*1000).toISOString().slice(0,10),total:counter(),factions:emptyFactions(),unique:new Set()});
  }
  for(const r of rows){
    const point=points.get(bucketStart(r.start,bucket));if(!point)continue;
    const c=counter(r.result===1?1:0,r.result===0?1:0);
    point.total=add(point.total,c);point.unique.add(r.match);
    const f=faction(r.country);if(point.factions[f])point.factions[f]=add(point.factions[f],c);
  }
  return {bucket,timezone:'Asia/Shanghai',points:[...points.values()].map(({unique,...point})=>({...point,uniqueMatches:unique.size}))};
}
export function buildAnalytics({rows,cohortRows,profiles,player,compare,start,cutoff,bucket}){
  const personal=player?rows.filter(r=>r.user===player):rows;
  const byMap=new Map();
  for(const r of personal){if(!byMap.has(r.map))byMap.set(r.map,[]);byMap.get(r.map).push(r);}
  const maps=[...byMap].map(([name,games])=>({name,...aggregate(games)})).sort((a,b)=>b.total.games-a.total.games||a.name.localeCompare(b.name,'zh-CN'));
  const comparisons=compare.map(id=>({...profiles.get(id),...aggregate(rows.filter(r=>r.user===id))}));
  const headToHead=[];
  for(let i=0;i<compare.length;i++)for(let j=i+1;j<compare.length;j++){
    const a=compare[i],b=compare[j],games=rows.filter(r=>r.user===a&&r.opponent===b);
    headToHead.push({a,b,...aggregate(games)});
  }
  const tiers=Object.fromEntries(Object.entries(SEGMENTS).map(([type,definitions])=>[type,definitions.map(def=>{
    const users=[...profiles.values()].filter(p=>inSegment(p,def.key));
    const ids=new Set(users.map(p=>p.id));
    return {key:def.key,name:def.name,players:users.length,...aggregate(cohortRows.filter(r=>ids.has(r.user)))};
  })]));
  return {maps,trend:trend(personal,start,cutoff,bucket),comparisons,headToHead,tiers};
}
