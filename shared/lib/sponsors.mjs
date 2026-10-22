export const SPONSOR_STATUS={pending:'待审核',approved:'已通过',rejected:'未通过'};
export function sponsorError(message,status=400){return Object.assign(new Error(message),{status});}
const text=(v,label,max,required=false)=>{
 if(v==null&&!required)return '';
 if(typeof v!=='string')throw sponsorError(label+'格式不正确');
 const s=v.trim();if((required&&!s)||s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw sponsorError(label+(required?'不能为空，且':'')+'最多'+max+'字，请勿输入换行或控制字符');return s;
};
export function validateSponsor(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw sponsorError('请填写赛事资料');
 const playerA=text(input.playerA,'选手一',64,true),playerB=text(input.playerB,'选手二',64,true);
 if(playerA.normalize('NFKC').toLowerCase()===playerB.normalize('NFKC').toLowerCase())throw sponsorError('双方选手不能相同');
 const playedAt=input.playedAt;
 if(typeof playedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(playedAt)||!Number.isFinite(Date.parse(playedAt))||Date.parse(playedAt)<946656000000||Date.parse(playedAt)>4102444800000)throw sponsorError('请填写有效的对战时间');
 const scoreA=input.scoreA,scoreB=input.scoreB;
 const platformId=(v,label)=>{const id=text(v,label,20);if(id&&!/^[1-9]\d{0,19}$/.test(id))throw sponsorError(label+'须为数字ID');return id;};
 const platformA=platformId(input.platformA,'选手一平台ID'),platformB=platformId(input.platformB,'选手二平台ID');
 if(platformA&&platformA===platformB)throw sponsorError('双方平台ID不能相同');
 if(![scoreA,scoreB].every(n=>Number.isInteger(n)&&n>=0&&n<=99)||scoreA+scoreB===0)throw sponsorError('比分须为0–99的整数，且不能同时为0');
 if(input.rounds!==undefined&&!Array.isArray(input.rounds))throw sponsorError('逐局资料格式不正确');
 const rounds=(input.rounds||[]).map((r,i)=>{
  if(!r||typeof r!=='object')throw sponsorError('第'+(i+1)+'局格式不正确');
  const map=text(r.map,'地图名',100);const winner=r.winner||null;
  if(winner!==null&&!['a','b'].includes(winner))throw sponsorError('第'+(i+1)+'局胜方格式不正确');
  if(!map&&!winner)throw sponsorError('第'+(i+1)+'局请至少填写地图或胜方');
  if(r.matchId){
   if(!/^[1-9]\d{7,29}$/.test(r.matchId)||!platformA||!platformB||typeof r.proof!=='string'||!Number.isInteger(r.start)||![r.countryA,r.countryB].every(n=>Number.isInteger(n)&&n>=0&&n<=9))throw sponsorError('导入对局信息不完整，请删除后重新导入');
   return {map,winner,matchId:r.matchId,start:r.start,countryA:r.countryA,countryB:r.countryB,proof:r.proof};
  }
  return {map,winner};
 });
 if(rounds.length>99||rounds.length>scoreA+scoreB)throw sponsorError('逐局数量不能超过总比分场次（最多99局）');
 if(rounds.filter(r=>r.winner==='a').length>scoreA||rounds.filter(r=>r.winner==='b').length>scoreB)throw sponsorError('逐局胜负与最终比分不一致');
 const ids=rounds.filter(r=>r.matchId).map(r=>r.matchId);if(new Set(ids).size!==ids.length)throw sponsorError('同一个对局编号不能重复登记');
 let replayUrl=text(input.replayUrl,'回放视频网址',1000);
 if(replayUrl){let url;try{url=new URL(replayUrl);}catch{throw sponsorError('请填写完整的视频网址，例如 https://www.bilibili.com/video/…');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.'))throw sponsorError('视频网址只支持不含登录信息的 http/https 链接');replayUrl=url.href;}
 return {playerA,playerB,platformA,platformB,playedAt:new Date(playedAt).toISOString(),scoreA,scoreB,sponsor:text(input.sponsor,'赞助者',100),replayUrl,rounds};
}
export function publicSponsor(record,review){
 const {id,createdAt,playerA,playerB,platformA,platformB,playedAt,scoreA,scoreB,sponsor,replayUrl,rounds}=record;
 return {id,createdAt,playerA,playerB,platformA,platformB,playedAt,scoreA,scoreB,sponsor,replayUrl:replayUrl||'',rounds:rounds.map(({proof,...r})=>r),status:review?.status||'pending',reviewedAt:review?.at||null};
}
export function beijingInputToIso(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw sponsorError('请填写对战时间');
 return new Date(value+':00+08:00').toISOString();
}
export async function sponsorIdentity(data,ticket,challenge){
 const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const ticketHash=await hash(ticket),at=Number(challenge.split('.')[1]);
 const identityData={...data};if(!identityData.replayUrl)delete identityData.replayUrl;
 return {id:String(9999999999999-at).padStart(13,'0')+'_'+await hash(ticketHash+JSON.stringify(identityData)),ticketHash};
}
