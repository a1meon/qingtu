import {useEffect,useRef,useState} from 'react';
import {SignOut} from '@phosphor-icons/react';
import {ToyArtwork} from './ToyArtwork.jsx';
import {useToyGesture} from './useToyGesture.js';
import './toys.css';

const native=window.qingtuToy;

export default function DesktopToy(){
 const [kind,setKind]=useState(null),[menu,setMenu]=useState(null),[error,setError]=useState('');
 const menuRef=useRef(null),returnFocus=useRef(null);
 const gesture=useToyGesture(kind,native);
 useEffect(()=>{
  let active=true,received=false;
  const stop=native.onKind(value=>{received=true;setKind(value);setMenu(null);});
  native.kind().then(value=>{if(active&&!received)setKind(value);},
   ()=>{if(active)setError('无法打开玩具');});
  return ()=>{active=false;stop();};
 },[]);
 useEffect(()=>{
  if(!menu)return;
  menuRef.current?.querySelector('button').focus({preventScroll:true});
  const close=()=>setMenu(null);
  const outside=event=>{if(!menuRef.current?.contains(event.target))close();};
  const escape=event=>{if(event.key==='Escape'){close();returnFocus.current?.focus({preventScroll:true});}};
  window.addEventListener('blur',close);
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('keydown',escape);
  return ()=>{
   window.removeEventListener('blur',close);
   document.removeEventListener('pointerdown',outside,true);
   document.removeEventListener('keydown',escape);
  };
 },[menu]);
 function showMenu(x,y){
  gesture.finish();
  const active=document.activeElement;
  returnFocus.current=active?.shadowRoot?.activeElement||active;
  setMenu({left:Math.max(8,Math.min(x,innerWidth-164)),top:Math.max(8,Math.min(y,innerHeight-54))});
 }
 return <main className="desktop-toy" aria-label="摸鱼玩具" onPointerDownCapture={event=>{
  if(event.button===2)event.stopPropagation();
 }} onContextMenu={event=>{
  event.preventDefault();showMenu(event.clientX,event.clientY);
 }}>
  <div className="desktop-toy-stage" data-dragging={gesture.dragging||undefined} {...gesture.handlers}>
   {error?<span className="toy-art-status" role="alert">{error}</span>:<ToyArtwork kind={kind}/>}
  </div>
  {menu&&<div className="toy-context-menu" ref={menuRef} role="menu" aria-label="玩具菜单" style={menu}>
   <button type="button" role="menuitem" onClick={()=>native.exit().catch(()=>{setMenu(null);setError('无法退出玩具，请重试');})}>
    <SignOut size={17} weight="bold" aria-hidden="true"/>退出摸鱼玩具
   </button>
  </div>}
 </main>;
}
