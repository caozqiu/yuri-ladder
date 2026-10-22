import {profile} from './core.mjs';
export const RANK_PAGE_SIZE=25;
// Official count is dynamic. Never silently truncate to 100 or assume 500.
export function rankingPage(data,page,expected=null){
 const count=Number(data?.count),totalPages=Math.ceil(count/RANK_PAGE_SIZE);
 if(!Number.isSafeInteger(count)||count<1||count>100000||Number(data.page)!==page||Number(data.totalPages)!==totalPages||!Array.isArray(data.list)||expected!==null&&count!==expected)throw new Error('来源榜单人数或分页变化，保留完整快照');
 const size=Math.min(RANK_PAGE_SIZE,Math.max(0,count-(page-1)*RANK_PAGE_SIZE));
 const players=data.list.map(profile);
 if(!size||players.length!==size||new Set(players.map(p=>p.id)).size!==size||players.some((p,i)=>!/^\d{1,20}$/.test(p.id)||p.rank!==(page-1)*RANK_PAGE_SIZE+i+1))throw new Error('来源榜单分页不一致，保留完整快照');
 return {players,count,totalPages};
}
export function validateRoster(players,count){
 const sorted=[...players].sort((a,b)=>a.rank-b.rank);
 if(sorted.length!==count||new Set(sorted.map(p=>p.id)).size!==count||sorted.some((p,i)=>p.rank!==i+1))throw new Error('全榜名单不完整或跨页重复，保留原统计');
 return sorted;
}
export const isTop100=p=>!!p&&p.rank>=1&&p.rank<=100;
