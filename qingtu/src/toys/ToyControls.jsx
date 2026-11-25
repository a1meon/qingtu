import {useEffect,useId,useRef,useState} from 'react';
import {GameController,Power,WarningCircle} from '@phosphor-icons/react';
import catalog from '../../desktop/toy-catalog.json';
import {ToyArtwork} from './ToyArtwork.jsx';
import './toys.css';

const native=window.qingtu;
const storageKey='qingtu.toy.kind';

function initialToy(){
 let saved;
 try{saved=localStorage.getItem(storageKey);}catch{}
 return {enabled:false,kind:catalog.some(item=>item.id===saved)?saved:catalog[0].id};
}

export function ToyControls(){
 const [state,setState]=useState(initialToy),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const region=useRef(null),trigger=useRef(null),panelId=useId();
 useEffect(()=>{
  if(!native)return;
  let active=true,received=false;
  const stop=native.onToyState(next=>{received=true;setState(next);});
  native.toyState().then(current=>{if(active&&!received&&current.enabled)setState(current);},
    ()=>{if(active)setError('无法读取桌面玩具状态');});
  return ()=>{active=false;stop();};
 },[]);
 useEffect(()=>{try{localStorage.setItem(storageKey,state.kind);}catch{}},[state.kind]);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(!region.current?.contains(event.target))setOpen(false);};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);

 async function setDesktopToy(next){
  if(!native||busy)return;
  setError('');
  setBusy(true);
  try{setState(await native.setToy(next));}
  catch{setError('无法更改桌面玩具，请重试');}
  finally{setBusy(false);}
 }
 function choose(kind){
  if(state.kind===kind||busy)return;
  if(state.enabled)setDesktopToy({kind,enabled:true});
  else setState({...state,kind});
 }

 return <div className="toy-nav-item" ref={region}>
  <button ref={trigger} type="button" className={`tool-button toy-launcher ${open?'selected':''}`}
   aria-label="摸鱼玩具" aria-expanded={open} aria-controls={open?panelId:undefined} title="摸鱼玩具"
   onClick={()=>setOpen(value=>!value)}>
   <GameController size={27} weight="duotone" aria-hidden="true"/>
   {state.enabled&&<span className="toy-active-dot" aria-hidden="true"/>}
  </button>
  {open&&<section className="toy-panel" id={panelId} aria-label="摸鱼玩具">
   <button type="button" className="toy-power-button" aria-label="桌面悬浮" aria-pressed={state.enabled}
    title={native?(state.enabled?'关闭桌面悬浮':'启用桌面悬浮'):'桌面版可启用悬浮'} disabled={!native||busy}
    onClick={()=>setDesktopToy({...state,enabled:!state.enabled})}><Power size={15} weight="bold" aria-hidden="true"/></button>
   {catalog.map(({id,name})=>{
    const chosen=state.kind===id;
    return <div key={id} className="toy-inline-preview" role="group" aria-label={chosen?`${name}，已选择`:name}
     data-toy={id} data-chosen={chosen||undefined}
     onPointerDownCapture={event=>{if(event.button===0)choose(id);}}
     onClick={event=>{if(event.detail===0)choose(id);}}
     onKeyDownCapture={event=>{if(event.key==='Enter'||event.key===' ')choose(id);}}>
     <ToyArtwork kind={id}/>
    </div>;
   })}
   {error&&<span className="toy-error" role="alert" title={error}>
    <WarningCircle size={18} aria-hidden="true"/><span className="sr-only">{error}</span>
   </span>}
  </section>}
 </div>;
}
