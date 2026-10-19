import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {editorPosition} from './editor-position.js';

export function ContextMenu({anchor,items,onClose,label='画布操作'}){
 const menu=useRef(),[position,setPosition]=useState({left:anchor.x,top:anchor.y});
 useLayoutEffect(()=>{const r=menu.current.getBoundingClientRect();setPosition(editorPosition(anchor,r,{width:innerWidth,height:innerHeight}));menu.current.querySelector('button')?.focus();},[]);
 useEffect(()=>{
  const close=event=>{if(!menu.current.contains(event.target))onClose();};
  document.addEventListener('pointerdown',close);window.addEventListener('resize',onClose);window.addEventListener('blur',onClose);
  return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',onClose);window.removeEventListener('blur',onClose);};
 },[onClose]);
 return createPortal(<div ref={menu} className="canvas-context-menu" style={position} role="menu" aria-label={label} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
  if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();onClose();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.current.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
 }}>{items.map(({label,icon:Icon,danger,action})=><button key={label} role="menuitem" className={danger?'danger':''} onClick={()=>{onClose();action();}}>{Icon&&<Icon size={18}/>}<span>{label}</span></button>)}</div>,document.body);
}
