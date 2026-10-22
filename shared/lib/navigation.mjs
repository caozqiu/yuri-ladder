export const SCREENS=['overview','players','matchups','maps','trends','sponsors','events'];
export const PRESETS_KEY='yuri-ladder-filter-presets-v1';
const keys=['season','range','opponents','group','player','map','segment','compare','bucket','tierBy','mmrMin','mmrMax','enemyMmrMin','enemyMmrMax','gapMin','gapMax','gapDirection','minSamples','screen','historyRange','research','historyPlayer'];
export function currentScreen(q,hash=''){
 if(SCREENS.includes(q.get('screen')))return q.get('screen');
 if(q.get('view')==='maps')return 'maps';
 if(q.get('view')==='trend')return 'trends';
 if(q.get('view')==='tiers')return 'matchups';
 if(q.get('player')||q.get('compare')||q.get('view')==='compare')return 'players';
 return ({'#leaderboard':'players','#matrix':'matchups','#insights':'players','#duel':'matchups'})[hash]||'overview';
}
export function presetQuery(value){
 const source=new URLSearchParams(value),q=new URLSearchParams();
 for(const key of keys){const v=source.get(key);if(v!==null&&v.length<=500)q.set(key,v);}
 q.set('screen',currentScreen(source));return q.toString();
}
export function parsePresets(value){
 try{const list=JSON.parse(value||'[]');return Array.isArray(list)?list.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()&&typeof p.query==='string').slice(0,30).map(p=>({id:p.id.slice(0,80),name:p.name.slice(0,40),query:presetQuery(p.query)})):[];}catch{return [];}
}
export function statsQuery(value){
 const q=new URLSearchParams(value);for(const k of ['screen','view','tierBy','own','enemy','detailMap','offset','rival','opponent','historyRange','research','historyPlayer','sponsorTab','sponsorId','eventTab','eventId'])q.delete(k);q.sort();return q.toString();
}
