import {useCallback,useEffect,useRef,useState} from 'react';
import {FAVORITES_KEY,parseFavorites,toggleFavorite} from '../lib/favorites.mjs';
export function useFavorites(notify:(message:string)=>void){
 const [favorites,setFavorites]=useState<string[]>([]);
 const storageUsable=useRef(true);
 useEffect(()=>{
   try{setFavorites(parseFavorites(localStorage.getItem(FAVORITES_KEY)));}catch{}
   const sync=(e:StorageEvent)=>{if(e.key===FAVORITES_KEY||e.key===null)setFavorites(parseFavorites(e.newValue));};
   window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 const toggle=useCallback((id:string)=>{
   let current=favorites;try{if(storageUsable.current)current=parseFavorites(localStorage.getItem(FAVORITES_KEY));}catch{storageUsable.current=false;}
   const next=toggleFavorite(current,id);setFavorites(next);
   try{if(!storageUsable.current)throw new Error();localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));notify(next.includes(id)?'已收藏，保存在当前浏览器':'已取消收藏');}
   catch{storageUsable.current=false;notify('浏览器禁止本地存储，收藏仅在本次页面中保留');}
 },[favorites,notify]);
 return {favorites,toggle};
}
