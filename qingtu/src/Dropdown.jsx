import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,Check} from '@phosphor-icons/react';

export function Dropdown({id:providedId,label,value,options,onChange,disabled=false,className='',maxHeight=Infinity,minMenuWidth=200}){
 const generatedId=useId(),id=providedId||generatedId;
 const [open,setOpen]=useState(false),[position,setPosition]=useState(null),[active,setActive]=useState(0);
 const trigger=useRef(),menu=useRef(),optionRefs=useRef([]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const selected=options.find(o=>o.value===value)||options[0];
 function show(){
  if(disabled)return;
  const rect=trigger.current.getBoundingClientRect(),height=Math.min(options.length*42+16,maxHeight,window.innerHeight-16);
  const up=rect.bottom+height+8>window.innerHeight,width=Math.max(rect.width,minMenuWidth);
  setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),top:Math.max(8,up?rect.top-height-6:rect.bottom+6),width,maxHeight:height,overflowY:'auto'});
  setActive(Math.max(0,options.findIndex(o=>o.value===value)));setOpen(true);
 }
 function choose(option){onChange(option.value);setOpen(false);trigger.current.focus();}
 useEffect(()=>{
  if(!open)return;
  optionRefs.current[active]?.focus();
  const close=e=>{if(!trigger.current.contains(e.target)&&!menu.current?.contains(e.target))setOpen(false);};
  const reposition=event=>{if(event.type==='scroll'&&menu.current?.contains(event.target))return;setOpen(false);};
  document.addEventListener('pointerdown',close);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);
  return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);};
 },[open]);
 useEffect(()=>{if(open)optionRefs.current[active]?.focus();},[active,open]);
 const keys=e=>{
  if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current.focus();}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);}
  if(e.key==='Home'){e.preventDefault();setActive(0);}if(e.key==='End'){e.preventDefault();setActive(options.length-1);}
  if(e.key==='Tab')setOpen(false);
 };
 return <><button ref={trigger} id={id} className={`dropdown-trigger ${className} ${open?'open':''}`} aria-label={label} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} disabled={disabled} onClick={()=>open?setOpen(false):show()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();show();}}}><span>{selected.label}</span><CaretDown size={14} aria-hidden/></button>{open&&createPortal(<div ref={menu} id={`${id}-list`} className="dropdown-menu" role="listbox" aria-label={label} style={position} onKeyDown={keys}>{options.map((option,i)=><button type="button" role="option" aria-selected={option.value===value} ref={el=>optionRefs.current[i]=el} tabIndex={i===active?0:-1} className={i===active?'focused':''} key={option.value} onClick={()=>choose(option)}><div><span>{option.label}</span>{option.description&&<small>{option.description}</small>}</div>{option.value===value&&<Check size={15} aria-hidden/>}</button>)}</div>,document.body)}</>;
}
