import {useEffect,useState} from 'react';
import {Crosshair,Info,SlidersHorizontal,X} from 'lucide-react';
import {parseRatingFilters,RATING_FIELDS} from '../lib/rating-filters.mjs';
import type {StatsResponse} from '../lib/types';
type Draft=Record<string,string>;
type Props={data:StatsResponse;query:string;update:(changes:Record<string,string|null>)=>void};
const keys=[...RATING_FIELDS,'gapDirection','minSamples'];
function fromQuery(query:string):Draft{const q=new URLSearchParams(query);return Object.fromEntries(keys.map(k=>[k,q.get(k)||(k==='gapDirection'?'any':'')]));}
const rangeLabel=(min:number|null,max:number|null)=>min!==null&&max!==null?`${min}–${max}`:min!==null?`≥${min}`:`≤${max}`;
export default function RatingFilterPanel({data,query,update}:Props){
 const [draft,setDraft]=useState<Draft>(()=>fromQuery(query)),[error,setError]=useState('');
 useEffect(()=>{setDraft(fromQuery(query));setError('');},[query]);
 const set=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const apply=(values:Draft)=>{
  try{
   const params=new URLSearchParams(values),parsed=parseRatingFilters(params),old=new URLSearchParams(query);
   const changes:Record<string,string|null>=Object.fromEntries(keys.map(k=>[k,values[k]&&values[k]!=='any'&&(k!=='minSamples'||values[k]!=='0')?values[k]:null]));
   if(['mmrMin','mmrMax'].some(k=>(old.get(k)||'')!==(values[k]||''))){changes.segment=null;changes.player=null;changes.compare=null;}
   if(parsed.minSamples<0)return;
   setError('');update(changes);
  }catch(e){setError(e instanceof Error?e.message:'筛选条件无效');}
 };
 const clear=()=>apply(Object.fromEntries(keys.map(k=>[k,k==='gapDirection'?'any':''])));
 const f=data.filters,c=data.coverage;
 const chips:[string,string,string[]][]=[];
 if(f.mmrMin!==null||f.mmrMax!==null)chips.push(['own','己方 '+rangeLabel(f.mmrMin,f.mmrMax),['mmrMin','mmrMax']]);
 if(f.enemyMmrMin!==null||f.enemyMmrMax!==null)chips.push(['enemy','对手 '+rangeLabel(f.enemyMmrMin,f.enemyMmrMax),['enemyMmrMin','enemyMmrMax']]);
 if(f.gapMin!==null||f.gapMax!==null)chips.push(['gap','绝对分差 '+rangeLabel(f.gapMin,f.gapMax),['gapMin','gapMax']]);
 if(f.gapDirection!=='any')chips.push(['direction',f.gapDirection==='stronger'?'只看更高分对手':'只看更低分对手',['gapDirection']]);
 const presets=[{name:'同水平 · 分差≤100',patch:{gapMin:'0',gapMax:'100',gapDirection:'any'}},{name:'分差≤200',patch:{gapMin:'0',gapMax:'200',gapDirection:'any'}},{name:'挑战高分 · 分差≤300',patch:{gapMin:'0',gapMax:'300',gapDirection:'stronger'}},{name:'观察低分 · 分差≤300',patch:{gapMin:'0',gapMax:'300',gapDirection:'weaker'}}];
 const pair=(prefix:string,label:string)=><fieldset><legend>{label}</legend><div className="rating-range"><input type="number" inputMode="numeric" min="0" max="100000" step="1" aria-label={label+'下限'} placeholder="不限" value={draft[prefix+'Min']} onChange={e=>set(prefix+'Min',e.target.value)}/><span>至</span><input type="number" inputMode="numeric" min="0" max="100000" step="1" aria-label={label+'上限'} placeholder="不限" value={draft[prefix+'Max']} onChange={e=>set(prefix+'Max',e.target.value)}/></div></fieldset>;
 return <section className="panel rating-filter-panel" aria-labelledby="rating-title"><div className="panel-heading"><div><span className="section-kicker">BUILD YOUR OWN MATCH SAMPLE</span><h2 id="rating-title"><SlidersHorizontal size={17}/>精细筛选</h2></div><span className="mini-badge">按榜单快照积分</span></div><div className="rating-filter-body"><div className="rating-presets" aria-label="分差快捷方案">{presets.map(p=><button key={p.name} type="button" onClick={()=>apply({...draft,...p.patch})}><Crosshair size={12}/>{p.name}</button>)}</div><form onSubmit={e=>{e.preventDefault();apply(draft);}}><div className="rating-fields">{pair('mmr','己方积分')}{pair('enemyMmr','对手积分')}{pair('gap','绝对分差')}<label className="rating-direction">对手分数方向<select aria-label="对手分数方向" value={draft.gapDirection} onChange={e=>set('gapDirection',e.target.value)}><option value="any">高分、同分、低分均可</option><option value="stronger">对手分数更高</option><option value="weaker">对手分数更低</option></select></label></div><div className="rating-actions"><label>榜单／地图最低样本<input type="number" inputMode="numeric" aria-label="最低样本数" min="0" max="10000" step="1" placeholder="0" value={draft.minSamples} onChange={e=>set('minSamples',e.target.value)}/><span>场</span></label><span className="rating-form-tip">留空不限，上下限均包含</span><button type="button" className="text-link" onClick={clear}>重置积分与分差</button><button type="submit" className="secondary apply-rating">应用筛选</button></div>{error&&<p className="rating-error" role="alert">{error}</p>}</form>{chips.length>0&&<div className="active-rating-filters" aria-label="已应用积分筛选">{chips.map(([key,label,fields])=><button key={key} onClick={()=>update(Object.fromEntries(fields.map(k=>[k,null])))}>{label}<X size={12}/></button>)}</div>}<div className={'rating-coverage '+(c.active?'coverage-active':'')} role="status"><div><strong>{c.matched.toLocaleString('zh-CN')}<small> / {c.before.toLocaleString('zh-CN')} 次出场</small></strong><span>{data.selected?data.selected.name:'当前己方范围'} · {c.active?'符合积分／分差条件':'未限制对手积分'}</span></div><div><strong>{c.comparablePercent===null?'—':c.comparablePercent.toFixed(1)+'%'}</strong><span>双方积分已知的出场占比</span></div>{c.active&&<div><strong>{c.excludedUnknown.toLocaleString('zh-CN')}<small> 次排除</small></strong><span>缺少筛选所需积分；其余 {c.excludedByScore.toLocaleString('zh-CN')} 次不符条件</span></div>}</div><p className="rating-basis-note"><Info size={13}/>积分取自当前赛季榜单快照，不是对局发生时积分。现有积分覆盖前100名；开启对手积分或分差条件后，缺少所需积分的对局自动排除。样本门槛只控制榜单与地图列表，不改变总体胜率、矩阵或走势；榜单按当前排序指标的场次判断。</p></div></section>;
}
