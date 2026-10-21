import {counter,add,faction,FACTIONS} from './core.mjs';

export const GAP_TIERS=[
 {key:'0-100',name:'0–100',min:0,max:100},
 {key:'101-200',name:'101–200',min:101,max:200},
 {key:'201-300',name:'201–300',min:201,max:300},
 {key:'301-500',name:'301–500',min:301,max:500},
 {key:'501+',name:'501及以上',min:501,max:Infinity},
];
export const DIRECTIONS=FACTIONS.flatMap(a=>FACTIONS.filter(b=>a.key!==b.key).map(b=>({own:a.key,enemy:b.key})));
function aggregate(rows){
 let total=counter();const ids=new Set();
 for(const r of rows){total=add(total,counter(r.result===1?1:0,r.result===0?1:0));ids.add(r.match);}
 return {...total,uniqueMatches:ids.size};
}
export function buildMatchups(rows){
 const cross=rows.filter(r=>faction(r.country)!==faction(r.enemy)&&FACTIONS.some(f=>f.key===faction(r.country))&&FACTIONS.some(f=>f.key===faction(r.enemy)));
 const cells=rs=>DIRECTIONS.map(d=>({...d,...aggregate(rs.filter(r=>faction(r.country)===d.own&&faction(r.enemy)===d.enemy))}));
 const pairs=FACTIONS.flatMap((a,i)=>FACTIONS.slice(i+1).map(b=>{
  const paired=cross.filter(r=>[a.key,b.key].includes(faction(r.country))&&[a.key,b.key].includes(faction(r.enemy)));
  return {a:a.key,b:b.key,uniqueMatches:new Set(paired.map(r=>r.match)).size,directions:cells(paired).filter(c=>[a.key,b.key].includes(c.own)&&[a.key,b.key].includes(c.enemy))};
 }));
 const known=cross.filter(r=>Number.isFinite(r.scoreGap));
 const gapTiers=GAP_TIERS.map(t=>({key:t.key,name:t.name,...aggregate(known.filter(r=>Math.abs(r.scoreGap)>=t.min&&Math.abs(r.scoreGap)<=t.max)),factions:Object.fromEntries(FACTIONS.map(f=>[f.key,aggregate(known.filter(r=>faction(r.country)===f.key&&Math.abs(r.scoreGap)>=t.min&&Math.abs(r.scoreGap)<=t.max))]))}));
 const byMap=new Map();for(const r of cross){if(!byMap.has(r.map))byMap.set(r.map,[]);byMap.get(r.map).push(r);}
 const mapMatchups=[...byMap].map(([name,rs])=>({name,...aggregate(rs),cells:cells(rs)})).sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name,'zh-CN'));
 return {matchups:pairs,gapTiers,mapMatchups,crossSummary:{...aggregate(cross),unknownGap:cross.length-known.length}};
}
