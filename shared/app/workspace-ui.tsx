import {CalendarDays,ChevronRight,FilePlus2,LayoutDashboard,ListOrdered,ShieldCheck,Sparkles,Trophy,Users} from 'lucide-react';

export function MobileDock({screen,go}:{screen:string;go:(key:string)=>void}){
 const links=[{key:'overview',name:'总览',icon:LayoutDashboard},{key:'players',name:'选手',icon:ListOrdered},{key:'events',name:'赛事',icon:CalendarDays},{key:'sponsors',name:'赞助赛',icon:Trophy},{key:'account',name:'我的',icon:Users}];
 return <nav className="mobile-dock" aria-label="手机快捷导航">{links.map(link=><button key={link.key} aria-current={screen===link.key?'page':undefined} onClick={()=>go(link.key)} className={screen===link.key?'selected':''}><link.icon size={21}/><span>{link.name}</span></button>)}</nav>;
}

const eventViews={
 list:{title:'发现下一场对决',description:'查看赛事规则与时间，选择你的比赛。',icon:CalendarDays},
 create:{title:'把你的赛事办起来',description:'填写规则与时间，提交审核后即可公开招募选手。',icon:FilePlus2},
 mine:{title:'你的赛事，都在这里',description:'办赛进度、报名记录与参赛名单，登录后跨设备查看。',icon:Users},
 review:{title:'赛事审核工作台',description:'核对赛事安排与规则，通过后向所有玩家开放。',icon:ShieldCheck}
};
export function EventSectionIntro({tab,owner,onCreate,onAccounts}:{tab:string;owner:boolean;onCreate:()=>void;onAccounts:()=>void}){
 const view=eventViews[tab as keyof typeof eventViews]||eventViews.list;
 return <div className="event-section-intro"><div className="section-symbol"><view.icon size={23}/></div><div><h2>{view.title}</h2><p>{view.description}</p></div>{tab==='list'&&<button className="sponsor-primary" onClick={onCreate}><FilePlus2 size={17}/>发起赛事</button>}{tab==='review'&&owner&&<button className="secondary" onClick={onAccounts}><Users size={17}/>用户账号管理<ChevronRight size={16}/></button>}</div>;
}

export function EventGuide({mode}:{mode:'create'|'review'}){
 const items=mode==='create'?[['01','填写赛事','安排赛制、报名窗口与比赛时间'],['02','等待审核','站主核对赛事信息，结果在我的赛事查看'],['03','分享招募','审核通过后复制报名链接，邀请选手']]:[['01','核对信息','确认双方可理解的赛制、时间和参赛要求'],['02','记录结果','填写审核说明，通过、驳回或撤回'],['03','管理报名','审核通过后查看报名人数与选手资料']];
 return <aside className="event-guide"><div className="guide-caption"><Sparkles size={16}/>{mode==='create'?'办赛只需三步':'审核流程'}</div>{items.map(([number,title,text])=><div className="guide-step" key={number}><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}<p className="guide-footnote">所有时间均为北京时间</p></aside>;
}

export function AccountWelcome(){
 return <aside className="account-welcome"><div className="welcome-kicker"><span/>尤复观察站 · 玩家社区</div><h2>下一场对决，<br/><em>从这里开始。</em></h2><p className="welcome-description">与熟悉的选手相遇，让每一场精彩对局都有记录。</p>
  <div className="welcome-signal" aria-hidden="true"><svg viewBox="0 0 380 236" fill="none"><circle cx="190" cy="118" r="89" stroke="#b8a2ef" strokeOpacity=".16"/><circle cx="190" cy="118" r="67" stroke="#b8a2ef" strokeOpacity=".16" strokeDasharray="3 9"/><path d="M45 118h290M190 18v200" stroke="#8b9ac1" strokeOpacity=".12"/><path d="m69 190 121-140 122 140H69Z" stroke="#a7acd3" strokeOpacity=".2"/><path d="m190 50 0 142M69 190l243-140M69 50l243 140" stroke="#a7acd3" strokeOpacity=".08"/><rect x="149" y="77" width="82" height="82" rx="24" transform="rotate(45 190 118)" fill="#9e81dc" fillOpacity=".1" stroke="#b6a1ff" strokeOpacity=".4"/><path fill="#cbb7ff" d="M163 96h12l15 23 15-23h12l-22 34v16h-10v-16z"/><circle cx="190" cy="29" r="9" fill="#a5bcf0" fillOpacity=".15" stroke="#a5bcf0" strokeOpacity=".6"/><circle cx="113" cy="162" r="9" fill="#df8fa6" fillOpacity=".15" stroke="#df8fa6" strokeOpacity=".6"/><circle cx="267" cy="162" r="9" fill="#b9a1fa" fillOpacity=".15" stroke="#b9a1fa" strokeOpacity=".6"/><circle cx="190" cy="29" r="3" fill="#a5bcf0"/><circle cx="113" cy="162" r="3" fill="#df8fa6"/><circle cx="267" cy="162" r="3" fill="#b9a1fa"/><path d="M38 53h14m-7-7v14M320 76h10m-5-5v10M307 204h14m-7-7v14" stroke="#b8a6e0" strokeOpacity=".6"/></svg></div>
  <div className="welcome-features">{[{icon:CalendarDays,title:'报名参赛',detail:'发现比赛，加入你的下一场对决'},{icon:Trophy,title:'记录精彩',detail:'分享赞助赛比分、地图与回放'},{icon:Users,title:'管理赛事',detail:'随时查看办赛申请与报名进度'}].map(item=><div key={item.title}><item.icon size={18}/><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}</div><div className="welcome-factions"><span><i style={{background:'#86b5f7'}}/>盟军</span><span><i style={{background:'#e28d9f'}}/>苏军</span><span><i style={{background:'#b6a1ff'}}/>尤里</span></div>
 </aside>;
}

