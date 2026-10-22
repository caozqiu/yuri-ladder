import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
const openDialogs:{node:HTMLDivElement;priority:number}[]=[];
let originalOverflow='';
const topDialog=()=>openDialogs.reduce<(typeof openDialogs)[number]|undefined>((top,item)=>!top||item.priority>=top.priority?item:top,undefined);
export default function Dialog({title,id,children,onClose,className='',priority=0}:{title:string;id:string;children:React.ReactNode;onClose:()=>void;className?:string;priority?:number}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement,node=host.current!;
  if(!openDialogs.length){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  const entry={node,priority};openDialogs.push(entry);
  if(topDialog()===entry)node.querySelector<HTMLElement>('button,input,textarea,select,a[href]')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(topDialog()!==entry)return;
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();}
   if(e.key==='Tab'){
    const items=[...(host.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]')||[])].filter(el=>el.getClientRects().length);
    if(!items.length)return;
    if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
    else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
   }
  };
  window.addEventListener('keydown',key);return()=>{
   const index=openDialogs.indexOf(entry);if(index>=0)openDialogs.splice(index,1);window.removeEventListener('keydown',key);
   if(!openDialogs.length)document.body.style.overflow=originalOverflow;
   const top=topDialog();if(previous?.isConnected&&(!top||top.node.contains(previous)))previous.focus({preventScroll:true});else top?.node.querySelector<HTMLElement>('button,input,textarea,select,a[href]')?.focus({preventScroll:true});
  };
 },[onClose,priority]);
 return <div className="dialog-mask" style={priority?{zIndex:1000+priority}:undefined} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={'dialog-panel '+className} ref={host} role="dialog" aria-modal="true" aria-labelledby={id}><header><h2 id={id}>{title}</h2><button className="icon-button" aria-label={'关闭'+title} onClick={onClose}><X size={20}/></button></header><div className="dialog-content">{children}</div></div></div>;
}
