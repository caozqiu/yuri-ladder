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
