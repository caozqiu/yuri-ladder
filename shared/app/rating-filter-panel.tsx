import {useCallback,useEffect,useState} from 'react';
import {Crosshair,Info,SlidersHorizontal,X} from 'lucide-react';
import {parseRatingFilters,RATING_FIELDS} from '../lib/rating-filters.mjs';
import Dialog from './dialog';
import type {StatsResponse} from '../lib/types';
type Draft=Record<string,string>;
type Props={data:StatsResponse;query:string;update:(changes:Record<string,string|null>)=>void};
const keys=[...RATING_FIELDS,'gapDirection','minSamples'];
function fromQuery(query:string):Draft{const q=new URLSearchParams(query);return Object.fromEntries(keys.map(k=>[k,q.get(k)||(k==='gapDirection'?'any':'')]));}
const rangeLabel=(min:number|null,max:number|null)=>min!==null&&max!==null?`${min}–${max}`:min!==null?`≥${min}`:`≤${max}`;
export default function RatingFilterPanel({data,query,update}:Props){
 const applied=JSON.stringify(fromQuery(query)),[draft,setDraft]=useState<Draft>(()=>fromQuery(query)),[error,setError]=useState(''),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false);
 const close=useCallback(()=>setOpen(false),[]);
 useEffect(()=>{setDraft(JSON.parse(applied));setError('');},[applied]);
 const set=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const dirty=keys.some(k=>(draft[k]||'')!==(fromQuery(query)[k]||''));
 const apply=(values:Draft)=>{
  try{
   parseRatingFilters(new URLSearchParams(values));const old=new URLSearchParams(query);
   const changes:Record<string,string|null>=Object.fromEntries(keys.map(k=>[k,values[k]&&values[k]!=='any'&&(k!=='minSamples'||values[k]!=='0')?values[k]:null]));
   if(['mmrMin','mmrMax'].some(k=>(old.get(k)||'')!==(values[k]||''))){changes.segment=null;changes.player=null;changes.compare=null;}
   setError('');update(changes);close();
  }catch(e){setError(e instanceof Error?e.message:'筛选条件无效');}
 };
 const f=data.filters,c=data.coverage,chips:[string,string,string[]][]=[];
 if(f.mmrMin!==null||f.mmrMax!==null)chips.push(['own','己方 '+rangeLabel(f.mmrMin,f.mmrMax),['mmrMin','mmrMax']]);
 if(f.enemyMmrMin!==null||f.enemyMmrMax!==null)chips.push(['enemy','对手 '+rangeLabel(f.enemyMmrMin,f.enemyMmrMax),['enemyMmrMin','enemyMmrMax']]);
 if(f.gapMin!==null||f.gapMax!==null)chips.push(['gap','绝对分差 '+rangeLabel(f.gapMin,f.gapMax),['gapMin','gapMax']]);
 if(f.gapDirection!=='any')chips.push(['direction',f.gapDirection==='stronger'?'只看更高分对手':'只看更低分对手',['gapDirection']]);
 if(f.minSamples)chips.push(['samples','列表至少 '+f.minSamples+' 场',['minSamples']]);
 const presets=[{name:'同水平 · 分差≤100',patch:{gapMin:'0',gapMax:'100',gapDirection:'any'}},{name:'分差≤200',patch:{gapMin:'0',gapMax:'200',gapDirection:'any'}},{name:'挑战高分 · ≤300',patch:{gapMin:'0',gapMax:'300',gapDirection:'stronger'}},{name:'观察低分 · ≤300',patch:{gapMin:'0',gapMax:'300',gapDirection:'weaker'}}];
 const pair=(prefix:string,label:string,slider=false)=>{
  const extent=data.ratingOptions,rawMin=draft[prefix+'Min'],rawMax=draft[prefix+'Max'];
  const minimum=Math.min(prefix==='mmr'?extent.min:0,rawMin?Number(rawMin):Infinity,rawMax?Number(rawMax):Infinity),maximum=Math.max(prefix==='mmr'?extent.max:extent.gapMax,Number(rawMin)||0,Number(rawMax)||0,minimum+1);
  const lower=rawMin===''?minimum:Number(rawMin),upper=rawMax===''?maximum:Number(rawMax);
  return <fieldset className={slider?'slider-field':''}><legend>{label}</legend>{slider&&<><div className="range-caption"><strong>{rawMin||'不限'} — {rawMax||'不限'}</strong><small>拖动选范围，也可精确输入</small></div><div className="dual-range"><div className="dual-track"/><div className="dual-fill" style={{left:((lower-minimum)/(maximum-minimum)*100)+'%',right:((maximum-upper)/(maximum-minimum)*100)+'%'}}/><input type="range" min={minimum} max={maximum} step="1" value={lower} aria-label={label+'滑杆下限'} onChange={e=>set(prefix+'Min',String(Math.min(Number(e.target.value),upper)))}/><input type="range" min={minimum} max={maximum} step="1" value={upper} aria-label={label+'滑杆上限'} onChange={e=>set(prefix+'Max',String(Math.max(Number(e.target.value),lower)))}/></div><div className="range-ticks"><span>{minimum.toLocaleString()}</span><span>{maximum.toLocaleString()}</span></div></>}<div className="rating-range"><input type="number" inputMode="numeric" min="0" max="100000" step="1" aria-label={label+'下限'} placeholder="不限" value={rawMin} onChange={e=>set(prefix+'Min',e.target.value)}/><span>至</span><input type="number" inputMode="numeric" min="0" max="100000" step="1" aria-label={label+'上限'} placeholder="不限" value={rawMax} onChange={e=>set(prefix+'Max',e.target.value)}/></div></fieldset>;
 };
 return <section className="filter-workbench" aria-label="高级筛选与样本漏斗"><div className="filter-workbench-head"><button className="secondary" onClick={()=>setOpen(true)}><SlidersHorizontal size={16}/>高级筛选{chips.length>0&&<span className="filter-count">{chips.length}</span>}</button><div className="active-rating-filters">{chips.length?chips.map(([key,label,fields])=><button key={key} onClick={()=>update(Object.fromEntries(fields.map(k=>[k,null])))} aria-label={'清除 '+label}>{label}<X size={12}/></button>):<span className="muted">积分与分差不限</span>}</div><span className="basis-label">榜单快照积分</span></div><button className="funnel-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>匹配 {c.matched.toLocaleString()} 次出场 · {data.funnel.at(-1)!.uniqueMatches.toLocaleString()} 场独立比赛 <span>{expanded?'收起':'展开'}漏斗</span></button><div className="sample-funnel" data-expanded={expanded} aria-label="筛选样本漏斗">{data.funnel.map((s,i)=><div key={s.key}><span>{i+1}. {s.name}</span><strong>{s.games.toLocaleString()}<small> 次出场</small></strong><small>{s.uniqueMatches.toLocaleString()} 场独立比赛</small></div>)}</div><p className="coverage-caption">双方积分已知占比 {c.comparablePercent===null?'—':c.comparablePercent.toFixed(1)+'%'}{c.active?` · 缺少所需积分排除 ${c.excludedUnknown.toLocaleString()} 次 · 已知积分不符 ${c.excludedByScore.toLocaleString()} 次`:''}。流局与无效局已排除；漏斗第3步仅检查当前条件所需积分。</p>{open&&<Dialog title="高级筛选" id="rating-title" onClose={close} className="filter-dialog"><p className="dialog-note">所有页面共用这些筛选。积分是本次榜单快照，非对局当时积分。</p><div className="rating-presets">{presets.map(p=><button key={p.name} type="button" onClick={()=>apply({...fromQuery(query),...p.patch})}><Crosshair size={13}/>{p.name}</button>)}</div><form onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="rating-fields">{pair('mmr','己方积分',true)}{pair('gap','绝对分差',true)}{pair('enemyMmr','对手积分')}<label className="rating-direction">对手分数方向<select aria-label="对手分数方向" value={draft.gapDirection} onChange={e=>set('gapDirection',e.target.value)}><option value="any">高分、同分、低分均可</option><option value="stronger">对手分数更高</option><option value="weaker">对手分数更低</option></select></label><label className="sample-input">榜单／地图最低样本<input type="number" aria-label="最低样本数" min="0" max="10000" placeholder="0" value={draft.minSamples} onChange={e=>set('minSamples',e.target.value)}/></label></div><p className="draft-status" role="status">{dirty?'有待应用的修改，当前结果尚未改变':'当前结果已应用这些条件'}</p>{error&&<p className="rating-error" role="alert">{error}</p>}<div className="rating-actions"><button type="button" className="text-link" onClick={()=>setDraft(Object.fromEntries(keys.map(k=>[k,k==='gapDirection'?'any':''])))}>清空草稿</button><span>留空不限，边界包含</span><button className="secondary apply-rating" type="submit">应用筛选</button></div></form><p className="rating-basis-note"><Info size={15}/>开启对手积分或分差条件后，缺少所需积分的对局排除。最低样本只控制榜单和地图列表，不改变总体、矩阵或走势；不足20场始终提示小样本。</p></Dialog>}</section>;
}
