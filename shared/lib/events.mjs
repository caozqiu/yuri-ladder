import {sponsorError} from './sponsors.mjs';
const clean=(v,label,max,required=false,multiline=false)=>{if(v==null&&!required)return '';if(typeof v!=='string')throw sponsorError(label+'格式不正确');const s=v.trim();if(required&&!s||s.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(s))throw sponsorError(label+(required?'不能为空，且':'')+'最多'+max+'字');return s;};
const date=(v,label)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw sponsorError('请填写有效的'+label);const [year,month,day]=v.slice(0,10).split('-').map(Number);if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==v.slice(0,10))throw sponsorError('请填写有效的'+label);return new Date(v).toISOString();};
export function validateEvent(input){
 if(!input||typeof input!=='object')throw sponsorError('请填写赛事资料');
 const title=clean(input.title,'赛事名称',100,true),organizer=clean(input.organizer,'发起人',64,true),description=clean(input.description,'赛事介绍与规则',3000,true,true),format=clean(input.format,'赛制',200,true),contact=clean(input.contact,'公开联系说明',200);
 const opensAt=date(input.opensAt,'报名开始时间'),closesAt=date(input.closesAt,'报名截止时间'),startsAt=date(input.startsAt,'比赛开始时间');
 if(Date.parse(opensAt)>=Date.parse(closesAt))throw sponsorError('报名截止时间须晚于报名开始时间');
 if(Date.parse(closesAt)>Date.parse(startsAt))throw sponsorError('报名截止时间不能晚于比赛开始时间');
 return {title,organizer,description,format,contact,opensAt,closesAt,startsAt};
}
export function validateEntry(input){
 const name=clean(input.name,'报名昵称',64,true),platformId=clean(input.platformId,'兰博平台ID',20,true),qq=clean(input.qq,'QQ号',12,true),note=clean(input.note,'报名备注',500,false,true);
 if(!/^[1-9]\d{0,19}$/.test(platformId))throw sponsorError('兰博平台ID须为有效数字ID');
 if(!/^[1-9]\d{4,11}$/.test(qq))throw sponsorError('QQ号须为5–12位数字，不能以0开头');return {name,platformId,qq,contact:qq,note};
}
export function eventPhase(item,now=Date.now()){
 if(now>=Date.parse(item.startsAt))return {key:'started',label:'赛事已开始',canJoin:false};
 if(now>=Date.parse(item.closesAt))return {key:'closed',label:'报名已截止',canJoin:false};
 if(now<Date.parse(item.opensAt))return {key:'upcoming',label:'报名未开始',canJoin:false};
 return {key:'open',label:'报名中',canJoin:true};
}
export function publicEvent(record,state,count,now=Date.now()){
 const {id,createdAt,title,organizer,description,format,contact,opensAt,closesAt,startsAt}=record;
 return {id,createdAt,title,organizer,description,format,contact,opensAt,closesAt,startsAt,status:state?.status||'pending',reviewedAt:state?.at||null,registrations:count.count,countLowerBound:count.lowerBound,phase:eventPhase(record,now)};
}
export async function eventEntryIdentity(id,platformId,ticket){
 const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const person=await hash(id+':'+platformId),ticketHash=await hash(ticket);return {person,ticketHash,entryId:person+'_'+ticketHash};
}
