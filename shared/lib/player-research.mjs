import {counter,add,faction,FACTIONS} from './core.mjs';
export const RELATIVE_SCORES=[{key:'stronger',name:'高分对手（高出100分以上）'},{key:'close',name:'相近对手（分差不超过100）'},{key:'weaker',name:'低分对手（低出100分以上）'},{key:'unknown',name:'积分未知的对手'}];
export function opponentDossier(rows,profiles,player){
 if(!player)return null;
 const rivals=new Map(),bands=RELATIVE_SCORES.map(b=>({...b,...counter(),opponents:new Set()}));
 for(const row of rows){
  if(row.user!==player)continue;
  const other=profiles.get(row.opponent),participant=row.game.players.find(p=>p.id===row.opponent);
  if(!rivals.has(row.opponent))rivals.set(row.opponent,{id:row.opponent,name:other?.name||participant?.name||'选手 '+row.opponent,rank:other?.rank??null,mmr:row.opponentMmr,inTop100:!!other,scoreGap:row.scoreGap,total:counter(),factions:Object.fromEntries(FACTIONS.map(f=>[f.key,counter()])),lastPlayed:0});
  const rival=rivals.get(row.opponent),c=counter(row.result===1?1:0,row.result===0?1:0);
  if(!other&&participant?.name&&row.start>=rival.lastPlayed)rival.name=participant.name;
  rival.total=add(rival.total,c);rival.lastPlayed=Math.max(rival.lastPlayed,row.start);
  const own=faction(row.country);if(rival.factions[own])rival.factions[own]=add(rival.factions[own],c);
  const band=bands.find(b=>b.key===(row.scoreGap===null?'unknown':row.scoreGap>100?'stronger':row.scoreGap< -100?'weaker':'close'));
  Object.assign(band,add(band,c));band.opponents.add(row.opponent);
 }
 const list=[...rivals.values()].sort((a,b)=>b.total.games-a.total.games||b.lastPlayed-a.lastPlayed||a.id.localeCompare(b.id));
 return {player,basis:'ladder-snapshot',closeGap:100,opponents:list.length,knownScoreGames:bands.filter(b=>b.key!=='unknown').reduce((n,b)=>n+b.games,0),bands:bands.map(b=>({...b,opponents:b.opponents.size})),rows:list};
}
export function rankingHistory(history,player,range='all'){
 const end=history.asOf,start=range==='7d'?end-7*86400:range==='30d'?end-30*86400:-Infinity;
 const observations=history.observations.filter(o=>o.at<=end).sort((a,b)=>a.at-b.at||a.snapshot.localeCompare(b.snapshot));
 if(!observations.some(o=>o.players.some(p=>p[0]===player)))return null;
 const points=observations.filter(o=>o.at>=start).map(o=>{const p=o.players.find(p=>p[0]===player);return {at:o.at,snapshot:o.snapshot,rank:p?.[1]??null,mmr:p?.[2]??null,status:p?'ranked':'outside'};});
 return {player,season:history.season,snapshot:history.snapshot,asOf:end,basis:'observed-ladder-snapshot',range,available:true,firstObserved:observations[0]?.at??null,points};
}
