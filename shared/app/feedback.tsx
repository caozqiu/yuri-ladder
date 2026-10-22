import {useCallback,useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,TriangleAlert} from 'lucide-react';
import Dialog from './dialog';
import './feedback.css';
// A new attempt must be noticeable even if it produces the same message.
export function useFeedbackState(){
 const [state,setState]=useState({message:'',revision:0});
 const setMessage=useCallback((value:string)=>setState(p=>({message:value,revision:p.revision+1})),[]);
 return [state.message,setMessage,state.revision] as const;
}
export default function Feedback({error='',success='',errorVersion=0,successVersion=0,children}:{error?:string;success?:string;errorVersion?:number;successVersion?:number;children?:React.ReactNode}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:700px)').matches),[dismissed,setDismissed]=useState<Set<string>>(()=>new Set()),id=useId();
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)'),sync=()=>setMobile(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 const message=error||success,isError=!!error,key=JSON.stringify([isError,message,isError?errorVersion:successVersion]);
 const close=useCallback(()=>setDismissed(previous=>new Set(previous).add(key)),[key]);
 if(!message)return null;
 const Icon=isError?TriangleAlert:Check;
 if(!mobile)return <div className={isError?'sponsor-error':'sponsor-success'} role={isError?'alert':'status'}>{!isError&&<Icon size={18}/>}<span>{message}</span>{isError&&children}</div>;
 if(dismissed.has(key))return null;
 return createPortal(<div className="feedback-portal"><Dialog title={isError?'请检查填写内容':'操作提示'} id={id} priority={1000} className={'feedback-dialog '+(isError?'feedback-error':'feedback-success')} onClose={close}><div className="feedback-message" role={isError?'alert':'status'}><Icon size={25}/><p>{message}</p></div><div className="feedback-actions">{isError&&children}<button className="feedback-confirm" onClick={close}>{isError?'知道了，继续修改':'我知道了'}</button></div></Dialog></div>,document.body);
}
