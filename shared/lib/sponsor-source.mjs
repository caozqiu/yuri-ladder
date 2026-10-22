import {parseSourceJSON} from './source-json.mjs';
import {sponsorError} from './sponsors.mjs';
export const PLATFORM_ID=/^[1-9]\d{0,19}$/;
export const MATCH_ID=/^[1-9]\d{7,29}$/;
export function proofValue(round,a,b){return JSON.stringify({platformA:a,platformB:b,matchId:round.matchId,map:round.map,winner:round.winner,start:round.start,countryA:round.countryA,countryB:round.countryB});}
export function normalizeSponsorMatch(s,matchId,platformA,platformB){
 if(String(s?.matchId)!==matchId)throw sponsorError('来源返回的对局编号不一致',502);
 if(s.gameVersion!==0||s.playerCount!==2||s.isEnd!==1)throw sponsorError('只支持已结束的尤里复仇双人对局');
 const ps=(s.players||[]).filter(p=>p.colorId!==null&&PLATFORM_ID.test(String(p.userId)));
 if(ps.length!==2)throw sponsorError('该对局不是两名真人选手的对局');
 const a=ps.find(p=>String(p.userId)===platformA),b=ps.find(p=>String(p.userId)===platformB);
 if(!a||!b||a===b)throw sponsorError('该对局的双方ID与绑定的选手不一致');
 if(![0,1].includes(a.matchStats)||![0,1].includes(b.matchStats)||a.matchStats+b.matchStats!==1)throw sponsorError('该对局为流局、无效局或结果尚未确认');
 if(![a.country,b.country].every(n=>Number.isInteger(n)&&n>=0&&n<=9))throw sponsorError('该对局的国家信息不完整');
 if(!Number.isSafeInteger(s.startTime)||s.startTime<946656000||s.startTime>4102444800||typeof s.mapName!=='string'||!s.mapName.trim()||s.mapName.length>100)throw sponsorError('该对局的地图或时间信息不完整');
 return {round:{map:s.mapName.trim(),winner:a.matchStats===1?'a':'b',matchId,start:s.startTime,countryA:a.country,countryB:b.country},nameA:a.username||'',nameB:b.username||'',platformA:String(a.userId),platformB:String(b.userId)};
}
export function normalizeSponsorMatchByNames(s,matchId,nameA,nameB){
 const normalize=value=>typeof value==='string'?value.normalize('NFKC').trim():'';
 const aName=normalize(nameA),bName=normalize(nameB);
 if(!aName||!bName||aName.length>64||bName.length>64)throw sponsorError('请填写双方在该局中显示的LBW平台昵称');
 if(aName===bName)throw sponsorError('双方平台昵称相同，无法自动区分，请改用手动填写地图、国家与胜负');
 const players=(s?.players||[]).filter(p=>p.colorId!==null&&PLATFORM_ID.test(String(p.userId)));
 const as=players.filter(p=>normalize(p.username)===aName),bs=players.filter(p=>normalize(p.username)===bName);
 if(as.length>1||bs.length>1)throw sponsorError('该对局存在同名昵称，无法自动区分，请改用手动填写地图、国家与胜负');
 if(as.length!==1||bs.length!==1)throw sponsorError('对局中的昵称与填写的LBW平台昵称不一致，请核对该局显示的完整昵称');
 return normalizeSponsorMatch(s,matchId,String(as[0].userId),String(bs[0].userId));
}
async function fetchSummary(matchId){
 let response;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{response=await fetch('https://api.ram-bo.com/datacenter/redalert/match/v1/summary?matchId='+matchId,{headers:{device:'6',device_id:'next-h5',language:'zh_CN',platform:'3',app_version_code:'9.9.9',Referer:'https://ra2.com/',Accept:'application/json'},signal:controller.signal});}catch{throw sponsorError('兰博接口暂时无法连接，请稍后重试',502);}finally{clearTimeout(timer);}
 if([403,429].includes(response.status))throw sponsorError('兰博接口暂时限流，请稍后重试',429);
 if(!response.ok)throw sponsorError('暂时无法读取这场对局',502);
 let data;try{data=parseSourceJSON(await response.text());}catch{throw sponsorError('兰博接口暂时不可用',502);}
 if(!data.success||!data.data)throw sponsorError('兰博平台未找到该对局');
 return data.data;
}
export async function fetchSponsorMatch(matchId,platformA,platformB){return normalizeSponsorMatch(await fetchSummary(matchId),matchId,platformA,platformB);}
export async function fetchSponsorMatchByNames(matchId,nameA,nameB){return normalizeSponsorMatchByNames(await fetchSummary(matchId),matchId,nameA,nameB);}
