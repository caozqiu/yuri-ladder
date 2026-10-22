const EVENT_ID=/^\d{13}_[a-f0-9]{64}$/;
export function eventRegistrationUrl(origin,id){
 if(!EVENT_ID.test(id))throw new Error('赛事编号不正确');
 const url=new URL('/',origin);url.search=new URLSearchParams({screen:'events',eventId:id,eventAction:'join'}).toString();return url.href;
}
// Only public community navigation may survive login. Never copy receipts or
// the current URL wholesale into a public link or a return destination.
export function communityReturnQuery(value){
 if(typeof value!=='string'||value.length>3000)return '';
 const q=new URLSearchParams(value),screen=q.get('screen');if(!['events','sponsors'].includes(screen))return '';
 const next=new URLSearchParams({screen});
 if(screen==='events'){
  const tab=q.get('eventTab');if(['create','mine'].includes(tab))next.set('eventTab',tab);
  const id=q.get('eventId');if(EVENT_ID.test(id||'')){next.delete('eventTab');next.set('eventId',id);if(q.get('eventAction')==='join')next.set('eventAction','join');}
 }else{
  const tab=q.get('sponsorTab');if(['apply','mine'].includes(tab))next.set('sponsorTab',tab);
 }
 return next.toString();
}
export function communityReturnUpdate(value){
 const q=communityReturnQuery(value);if(!q)return null;
 return {eventTab:null,eventId:null,eventAction:null,sponsorTab:null,sponsorId:null,accountTab:null,returnTo:null,...Object.fromEntries(new URLSearchParams(q))};
}
