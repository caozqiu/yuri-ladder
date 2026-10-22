import {useEffect,useState} from 'react';

const preference='yuri-appearance-decoration-v1';
export function useDecorations(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem(preference)!=='off';}catch{return true;}});
 useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key===preference)setEnabled(e.newValue!=='off');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 const toggle=()=>setEnabled(previous=>{const next=!previous;try{localStorage.setItem(preference,next?'on':'off');}catch{}return next;});
 return {enabled,toggle};
}

// Decorative vector artwork stays out of the reading and keyboard order.
export function ObserverArt(){return <div className="header-art" aria-hidden="true">
 <svg className="observer-orbit" viewBox="0 0 280 180" fill="none"><circle cx="158" cy="99" r="69"/><ellipse cx="158" cy="99" rx="116" ry="43" transform="rotate(-24 158 99)"/><path d="M26 44h28m-14-14v28M234 43h14m-7-7v14M63 133h12m-6-6v12"/><circle cx="237" cy="126" r="3"/><circle cx="82" cy="41" r="2"/></svg>
 <svg className="observer-portrait" viewBox="0 0 180 190" fill="none">
  <defs><linearGradient id="observer-hair" x1="50" y1="20" x2="133" y2="159" gradientUnits="userSpaceOnUse"><stop stopColor="#f1efff"/><stop offset="1" stopColor="#a9b0d0"/></linearGradient><linearGradient id="observer-jacket" x1="60" y1="139" x2="130" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#424868"/><stop offset="1" stopColor="#20253e"/></linearGradient></defs>
  <path d="M44 112C31 69 44 28 80 20c37-9 66 19 63 61l7 68-39 15-62-15z" fill="url(#observer-hair)" stroke="#7883ac" strokeWidth="1.4"/>
  <path d="M52 143c-20 5-29 17-33 47h143c-3-26-11-42-34-48l-32-7z" fill="url(#observer-jacket)" stroke="#707499" strokeWidth="1.5"/>
  <path d="M78 123v19l13 14 16-15v-22" fill="#efcfce" stroke="#ad96ab" strokeWidth="1.2"/>
  <path d="m74 138 17 16-13 17-13-24m43-10-17 17 16 17 13-25" fill="#2d334d" stroke="#b7a1e1" strokeWidth="1.5"/>
  <path d="M91 156v34m-42-25-6 25m90-25 7 25" stroke="#a89ac7" strokeWidth="1.5"/>
  <path d="m106 176 5-5 5 5-5 5z" fill="#a9d8dd"/>
  <path d="M56 73c1 38 12 57 36 60 23 0 39-23 39-58l-34-28z" fill="#f8e3de" stroke="#b6a3b4" strokeWidth="1.4"/>
  <path d="M48 83c-7-31 5-53 33-58 35-7 53 14 56 53-9-7-16-17-20-30-4 17-13 28-24 35l5-31C83 72 68 82 48 86z" fill="url(#observer-hair)" stroke="#8289ad" strokeWidth="1.4" strokeLinejoin="round"/>
  <path d="m68 88 10-1m26 0 10 2" stroke="#8b80a0" strokeWidth="1.7" strokeLinecap="round"/>
  <path d="M64 95c5-6 13-6 19-1m19 1c5-5 12-4 16 0" stroke="#4c4b70" strokeWidth="2.4" strokeLinecap="round"/>
  <ellipse cx="75" cy="99" rx="4.4" ry="6" fill="#8e80be"/><ellipse cx="109" cy="99" rx="4.4" ry="6" fill="#8e80be"/>
  <circle cx="76" cy="97" r="1.8" fill="#fff"/><circle cx="110" cy="97" r="1.8" fill="#fff"/>
  <path d="m91 105-2 5h3m-7 9c4 2 8 2 12-1" stroke="#be939c" strokeWidth="1.3" strokeLinecap="round"/>
  <path d="m61 109 9 1m43 0 9-1" stroke="#e5acb3" strokeWidth="2.5" strokeLinecap="round" opacity=".6"/>
  <path d="M52 82c-4 23-1 42 9 59l9-21-5-44m65-3-6 45 7 25c9-18 11-38 6-61" fill="url(#observer-hair)" stroke="#8289ad" strokeWidth="1.4"/>
  <path d="m120 55 11 6m-12-1 10 6" stroke="#b6a0e9" strokeWidth="3" strokeLinecap="round"/>
  <rect x="132" y="86" width="9" height="22" rx="4" fill="#343c5c" stroke="#b2a0d7" strokeWidth="1.3"/>
  <path d="M137 104c0 12-8 14-15 14" stroke="#a9b0d0" strokeWidth="1.6"/><rect x="117" y="115" width="9" height="4" rx="2" fill="#b6c5e5"/>
 </svg>
 <span className="art-spark art-spark-one">✦</span><span className="art-spark art-spark-two">✧</span>
 </div>;}
