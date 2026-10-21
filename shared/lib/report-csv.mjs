import {FACTIONS} from './core.mjs';
import {wilson95} from './rating-filters.mjs';
const pct=n=>n===null||n===undefined?'—':n.toFixed(2)+'%';
const interval=c=>{const i=wilson95(c);return i?[pct(i.low),pct(i.high)]:['—','—'];};
export function csvCell(value){
 let s=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function reportRows(data,players,cutoffLabel){
 const f=data.filters,c=data.coverage,fields=['mmrMin','mmrMax','enemyMmrMin','enemyMmrMax','gapMin','gapMax'];
 const rows=[['赛季',data.season?.name,'周期',data.window,'对手范围',data.scope,'地图',f.map||'全部','分段',f.segment||'全部','积分依据','本次榜单快照，非比赛时积分','统计截止',cutoffLabel],
 ['精细筛选',...fields.flatMap(k=>[k,f[k]??'不限']),'gapDirection',f.gapDirection,'minSamples',f.minSamples,'门槛口径','仅榜单和地图列表，榜单按排序指标场次'],
 ['覆盖率','筛选前出场',c.before,'符合条件出场',c.matched,'双方积分已知出场',c.comparable,'未知积分排除',c.excludedUnknown,'已知积分不符条件',c.excludedByScore],
 ['排名','选手','积分','有效场次','总胜率','95%下界','95%上界',...FACTIONS.flatMap(x=>[x.name+'场次',x.name+'胜率'])],
 ...players.map(p=>[p.rank,p.name,p.mmr,p.total.games,pct(p.total.winRate),...interval(p.total),...FACTIONS.flatMap(x=>[p.factions[x.key].games,pct(p.factions[x.key].winRate)])]),[],
 ['己方','对手','场次','胜','负','胜率','95%下界','95%上界'],
 ...data.matrix.map(v=>[data.groups.find(g=>g.key===v.own)?.name,data.groups.find(g=>g.key===v.enemy)?.name,v.games,v.wins,v.losses,pct(v.winRate),...interval(v)]),[],
 ['地图','独立比赛','出场次数','胜','负','总胜率','95%下界','95%上界',...FACTIONS.flatMap(x=>[x.name+'场次',x.name+'胜率'])],
 ...data.analytics.maps.filter(m=>m.total.games>=f.minSamples).map(m=>[m.name,m.uniqueMatches,m.total.games,m.total.wins,m.total.losses,pct(m.total.winRate),...interval(m.total),...FACTIONS.flatMap(x=>[m.factions[x.key].games,pct(m.factions[x.key].winRate)])]),[],
 ['走势（北京时间）',data.analytics.trend.bucket,'场次','胜','负','胜率','95%下界','95%上界'],
 ...data.analytics.trend.points.map(p=>[p.label,'全部阵营',p.total.games,p.total.wins,p.total.losses,pct(p.total.winRate),...interval(p.total)]),[],
 ['对比选手','场次','胜','负','胜率','95%下界','95%上界'],
 ...data.analytics.comparisons.map(p=>[p.name,p.total.games,p.total.wins,p.total.losses,pct(p.total.winRate),...interval(p.total)]),[],
 ['分段类型','分段（榜单快照）','选手数','出场次数','胜','负','胜率','95%下界','95%上界',...FACTIONS.flatMap(x=>[x.name+'场次',x.name+'胜率'])],
 ...Object.entries(data.analytics.tiers).flatMap(([type,tiers])=>tiers.map(t=>[type,t.name,t.players,t.total.games,t.total.wins,t.total.losses,pct(t.total.winRate),...interval(t.total),...FACTIONS.flatMap(x=>[t.factions[x.key].games,pct(t.factions[x.key].winRate)])]))];
 return rows;
}
export function makeReportCsv(data,players,cutoffLabel){return '\uFEFF'+reportRows(data,players,cutoffLabel).map(row=>row.map(csvCell).join(',')).join('\r\n');}
