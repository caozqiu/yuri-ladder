// An immutable opponent country already in the complete snapshot is not missing.
// Reuse it only when every fresh observation agrees on identity, version and result.
export function verifiedKnownMatch(rows,known,season){
 if(!known||known.season!==season||known.players?.length!==2||!rows.length)return null;
 if(known.players.some(p=>!Number.isInteger(p.country)||p.country<0||p.country>9))return null;
 for(const r of rows){
  if(r.gameType!==4||r.gameVersion!==0||r.playerCount!==2||r.single||![0,1,2].includes(r.status)||String(r.matchId)!==known.id||r.startTime!==known.start)return null;
  const own=known.players.find(p=>p.id===String(r.userId));
  const ids=(r.playerIds||[]).map(String);
  if(!own||own.country!==r.country||own.result!==r.status||known.players.some(p=>!ids.includes(p.id)))return null;
 }
 return {...known,map:rows[0].mapName||known.map};
}
