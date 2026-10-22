import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export default function Dialog({title,id,children,onClose,className=''}:{title:string;id:string;children:React.ReactNode;onClose:()=>void;className?:string}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';host.current?.querySelector<HTMLElement>('button,input,textarea,select,a[href]')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();onClose();}
   if(e.key==='Tab'){
    const items=[...(host.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]')||[])].filter(el=>el.getClientRects().length);
    if(!items.length)return;
    if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
    else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
   }
  };
  window.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',key);previous?.isConnected&&previous.focus();};
 },[onClose]);
 return <div className="dialog-mask" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={'dialog-panel '+className} ref={host} role="dialog" aria-modal="true" aria-labelledby={id}><header><h2 id={id}>{title}</h2><button className="icon-button" aria-label={'关闭'+title} onClick={onClose}><X size={20}/></button></header><div className="dialog-content">{children}</div></div></div>;
}
