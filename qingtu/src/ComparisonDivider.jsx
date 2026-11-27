import {useEffect,useRef} from 'react';
import {CaretLeft,CaretRight} from '@phosphor-icons/react';

export function ComparisonDivider({container,position,onChange,label='原图与处理结果对比',dragClassName=''}){
 const slider=useRef(),drag=useRef(null),frame=useRef(0);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 function update(value){
  position.current=Math.max(0,Math.min(100,value));
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=0;
   container.current?.style.setProperty('--split',`${position.current}%`);
   onChange?.(drag.current?.rect);
   if(slider.current)slider.current.value=position.current;
  });
 }
 function move(event){
  if(drag.current?.id!==event.pointerId)return;
  const {rect}=drag.current;
  update((event.clientX-rect.left)/rect.width*100);
 }
 return <>
  <div className="split-line" aria-hidden="true"><span className="split-handle"><CaretLeft size={13}/><CaretRight size={13}/></span></div>
  <input ref={slider} className="compare-slider" type="range" aria-label={label} defaultValue={position.current} min="0" max="100" onInput={event=>update(Number(event.currentTarget.value))}/>
  <div className={`drag-comparison ${dragClassName}`} aria-hidden="true" onPointerDown={event=>{
   if(event.button!==0||drag.current)return;
   const rect=container.current.getBoundingClientRect();if(!rect.width)return;
   drag.current={id:event.pointerId,rect};event.currentTarget.setPointerCapture(event.pointerId);move(event);
  }} onPointerMove={move} onPointerUp={event=>{if(drag.current?.id===event.pointerId){move(event);drag.current=null;}}}
  onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)drag.current=null;}}/>
 </>;
}
