import {useEffect,useRef} from 'react';
import {cropFromDrag} from '../../engine/crop-transform.mjs';
import {imageGeometry} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';

const names={left:'左',right:'右',top:'上',bottom:'下'};
export function CanvasCropOverlay({image,rect,scale,value,onStart,onPreview,onEnd,disabled}){
 const gesture=useRef(),frame=useRef(),callbacks=useRef(),moveRef=useRef(),endRef=useRef(),flushRef=useRef();
 callbacks.current={onStart,onPreview,onEnd};
 function start(event,side){
  if(disabled||event.button!==0)return;
  event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:event.pointerId,side,x:event.clientX,y:event.clientY,rect:{...rect},value,scale,distance:0};callbacks.current.onStart(side);
 }
 function move(event){
  const drag=gesture.current;if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.distance=Math.hypot(dx,dy);
  drag.next=cropFromDrag(image,drag.value,drag.rect,drag.side,dx/drag.scale,dy/drag.scale);
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{frame.current=null;if(gesture.current===drag&&drag.distance>=2)callbacks.current.onPreview(drag.next.edit,drag.next.position);});
 }
 function finish(cancelled){
  const drag=gesture.current;if(!drag)return;
  gesture.current=null;cancelAnimationFrame(frame.current);frame.current=null;
  if(!cancelled&&drag.next&&drag.distance>=2){callbacks.current.onPreview(drag.next.edit,drag.next.position);return callbacks.current.onEnd(false,drag.id);}
  return callbacks.current.onEnd(true,drag.id);
 }
 function end(event){if(gesture.current?.id!==event.pointerId)return;if(event.type!=='pointercancel')move(event);return finish(event.type==='pointercancel');}
 moveRef.current=move;endRef.current=end;flushRef.current=()=>finish(false);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const track=e=>moveRef.current(e),release=e=>endRef.current(e),escape=e=>{if(gesture.current&&e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(true);}};document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);document.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);document.removeEventListener('keydown',escape,true);cancelAnimationFrame(frame.current);};},[]);
 function key(event,side){
  if(disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  const horizontal=['left','right'].includes(side);if(horizontal&&!['ArrowLeft','ArrowRight'].includes(event.key)||!horizontal&&!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const source=imageGeometry(image,value),step=(event.shiftKey?10:1)*(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
  const next=cropFromDrag(image,value,rect,side,horizontal?step*rect.width/source.width:0,horizontal?0:step*rect.height/source.height);
  callbacks.current.onStart(side);callbacks.current.onPreview(next.edit,next.position);callbacks.current.onEnd(false);
 }
 return <div className="canvas-crop-target" data-canvas-crop style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale}}>
  {Object.entries(names).map(([side,label])=><button key={side} className={`crop-edge-handle crop-edge-${side}`} aria-label={`拖动裁剪${label}边`} title={`拖动裁剪${label}边`} disabled={disabled} onPointerDown={event=>start(event,side)} onKeyDown={event=>key(event,side)}><span/></button>)}
 </div>;
}
