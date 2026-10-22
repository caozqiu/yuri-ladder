import {useCallback,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {useAccount} from './accounts';
import {LoginRequired} from './community-access';
import {SPONSOR_STATUS} from '../lib/sponsors.mjs';

type OwnedEvent={id:string;title:string;status:'pending'|'approved'|'rejected';registrations:number;countLowerBound:boolean;reason?:string};
type OwnedEntry={id:string;entryId:string;title:string;name:string;createdAt:string};
type Records={owner:string;items:OwnedEvent[];entries:OwnedEntry[];cursor:string|null;entryCursor:string|null};
export default function MemberEvents({query,update,onManage,onEntry}:{query:string;update:(v:Record<string,string|null>)=>void;onManage:(v:OwnedEvent)=>void;onEntry:(v:OwnedEntry)=>void}){
 const {user,loading}=useAccount(),identity=useRef(user?.id);identity.current=user?.id;
 const [records,setRecords]=useState<Records|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const revision=useRef(0),abort=useRef<AbortController|null>(null);
 const load=useCallback(async(kind='all',cursor?:string)=>{
  if(!user)return;const expected=user.id,current=++revision.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),20000);setBusy(true);setError('');
  try{
   const params=new URLSearchParams({action:'mine',...(cursor?{[kind==='entries'?'entryCursor':'cursor']:cursor}:{})});
   const r=await fetch('/api/events?'+params,{credentials:'same-origin',cache:'no-store',signal:controller.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'账号赛事暂时无法读取');
   if(current!==revision.current||identity.current!==expected)return;
   setRecords(previous=>{
    const old=previous?.owner===expected?previous:null;
    const merge=(a:any[],b:any[],key:string)=>[...new Map([...a,...b].map(v=>[v[key],v])).values()];
    return {owner:expected,items:kind==='entries'?old?.items||[]:cursor?merge(old?.items||[],j.items,'id'):j.items,entries:kind==='events'?old?.entries||[]:cursor?merge(old?.entries||[],j.entries,'entryId'):j.entries,cursor:kind==='entries'?old?.cursor||null:j.cursor||null,entryCursor:kind==='events'?old?.entryCursor||null:j.entryCursor||null};
   });
  }catch(e:any){if(current===revision.current&&identity.current===expected)setError(controller.signal.aborted?'读取超时，请重试；已有记录已保留。':e.message);}
  finally{clearTimeout(timer);if(current===revision.current)setBusy(false);}
 },[user?.id]);
 useEffect(()=>{setRecords(null);setError('');setBusy(false);if(user)load();return()=>{revision.current++;abort.current?.abort();};},[user?.id,load]);
 const mine=records?.owner===user?.id?records:null;
 if(loading)return <p className="sponsor-note" role="status">正在确认登录状态…</p>;
 if(!user)return <LoginRequired query={query} update={update} label="查看账号下的赛事与报名"/>;
 return <section className="member-event-records" aria-label="账号赛事与报名"><header><div><h2>账号下的赛事与报名</h2><p className="sponsor-note">已登录 {user.nickname}，这里同步当前账号的记录，换设备也可查看。待审核的赛事仅你和站主可见。</p></div><button className="secondary" aria-busy={busy} disabled={busy} onClick={()=>load()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'读取中…':'刷新记录'}</button></header>
 {error&&<p className="sponsor-error" role="alert">{error}</p>}{busy&&!mine&&<p className="sponsor-note" role="status">正在读取账号记录…</p>}
 {mine&&<><h3 className="event-subheading">我发起的赛事</h3>{mine.items.map(item=><article className="sponsor-receipt account-event-row" key={item.id}><div><strong>{item.title}</strong><span className={'sponsor-badge '+item.status}>{SPONSOR_STATUS[item.status]}</span><small>{item.registrations}{item.countLowerBound?'+':''} 人报名{item.status==='pending'?' · 审核通过后才会公开':''}</small>{item.reason&&<small>审核说明：{item.reason}</small>}</div><button className="secondary" onClick={()=>onManage(item)}>管理赛事</button></article>)}{!mine.items.length&&<p className="sponsor-note">这个账号还没有办赛申请。旧版回执可在下方查询。</p>}{mine.cursor&&<button className="secondary" disabled={busy} onClick={()=>load('events',mine.cursor!)}>继续加载我发起的赛事</button>}
 <h3 className="event-subheading">我的报名</h3>{mine.entries.map(entry=><article className="sponsor-receipt" key={entry.entryId}><div><strong>{entry.title}</strong><small>报名昵称：{entry.name} · {new Date(entry.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</small></div><button className="secondary" onClick={()=>onEntry(entry)}>查看报名</button></article>)}{!mine.entries.length&&<p className="sponsor-note">这个账号还没有报名记录。</p>}{mine.entryCursor&&<button className="secondary" disabled={busy} onClick={()=>load('entries',mine.entryCursor!)}>继续加载我的报名</button>}</>}
 </section>;
}
