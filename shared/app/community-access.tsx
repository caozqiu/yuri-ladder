import {useRef,useState} from 'react';
import {ClipboardCopy,LogIn} from 'lucide-react';
import {useAccount} from './accounts';
import {communityReturnQuery,eventRegistrationUrl} from '../lib/community-navigation.mjs';
import './community-access.css';
type Update=(v:Record<string,string|null>)=>void;
export function LoginRequired({query,update,label}:{query:string;update:Update;label:string}){
 const {loading}=useAccount();
 return <section className="community-login-required"><h3>{loading?'正在检查登录状态…':'登录后'+label}</h3><p>请先登录或注册普通账号，完成后会返回这里继续操作。</p><button className="sponsor-primary" disabled={loading} onClick={()=>update({screen:'account',accountTab:'login',returnTo:communityReturnQuery(query)})}><LogIn size={16}/>登录 / 注册</button></section>;
}
export function EventSignupLink({id,title,status,compact=false}:{id:string;title:string;status?:string;compact?:boolean}){
 const [message,setMessage]=useState(''),[fallback,setFallback]=useState(false),input=useRef<HTMLInputElement>(null);
 const url=eventRegistrationUrl(window.location.origin,id);
 async function copy(){try{await navigator.clipboard.writeText(url);setFallback(false);setMessage('报名链接已复制，可以分享给参赛者。');}catch{setFallback(true);setMessage('请选中下方报名链接手动复制。');}}
 return <section className={'event-share'+(compact?' event-share-compact':'')} aria-label={title+'的报名链接'}><div className="event-share-actions"><button type="button" className="secondary" onClick={copy}><ClipboardCopy size={16}/>复制报名链接</button>{!compact&&status==='approved'&&<a className="text-link" href={url}>打开报名页</a>}</div>{(!compact||fallback)&&<label>公开报名地址<input ref={input} aria-label="公开报名地址" value={url} readOnly onFocus={e=>e.currentTarget.select()} onClick={e=>e.currentTarget.select()}/></label>}{!compact&&<p>{status&&status!=='approved'?'此地址在赛事审核通过后可供参赛者查看。':'打开后直接定位到这场赛事的报名入口。'} 报名须先登录，并在报名时间内提交。</p>}{message&&<p role="status">{message}</p>}</section>;
}
