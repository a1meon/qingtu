import {useEffect,useRef} from 'react';
import {CROP_HANDLES,cropFromDrag} from '../../engine/crop-transform.mjs';
import {rotateVector} from '../../engine/image-rotation.mjs';
import {imageGeometry} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';

const names={left:'左边',right:'右边',top:'上边',bottom:'下边',nw:'左上角',ne:'右上角',se:'右下角',sw:'左下角'};
export function CanvasCropOverlay({image,rect,scale,value,onStart,onPreview,onEnd,disabled}){
 const gesture=useRef(),frame=useRef(),callbacks=useRef(),moveRef=useRef(),endRef=useRef(),flushRef=useRef();
 callbacks.current={onStart,onPreview,onEnd};
 function start(event,side){
  if(disabled||event.button!==0)return;
  event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:event.pointerId,side,x:event.clientX,y:event.clientY,rect:{...rect},value,scale};callbacks.current.onStart(side);
 }
 function move(event,ending=false){
  const drag=gesture.current;if(!drag||drag.id!==event.pointerId||!ending&&event.buttons===0)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  drag.dx=dx;drag.dy=dy;
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{frame.current=null;if(gesture.current===drag)callbacks.current.onPreview(calculate(drag));});
 }
 function calculate(drag){
  const local=rotateVector((drag.dx||0)/drag.scale,(drag.dy||0)/drag.scale,-(image.angle||0));
  return cropFromDrag(image,drag.value,drag.rect,drag.side,local.x,local.y).edit;
 }
 function finish(cancelled){
  const drag=gesture.current;if(!drag)return;
  gesture.current=null;cancelAnimationFrame(frame.current);frame.current=null;
  if(!cancelled&&(drag.dx||drag.dy)){
   const edit=calculate(drag);
   if(CROP_HANDLES[drag.side].some(edge=>edit.edges[edge]!==drag.value.edges[edge])){
    callbacks.current.onPreview(edit);return callbacks.current.onEnd(false,drag.id);
   }
  }
  return callbacks.current.onEnd(true,drag.id);
 }
 function end(event){if(gesture.current?.id!==event.pointerId)return;if(event.type!=='pointercancel')move(event,true);return finish(event.type==='pointercancel');}
 moveRef.current=move;endRef.current=end;flushRef.current=()=>finish(false);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const track=e=>moveRef.current(e),release=e=>endRef.current(e),escape=e=>{if(gesture.current&&e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(true);}};document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);document.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);document.removeEventListener('keydown',escape,true);cancelAnimationFrame(frame.current);};},[]);
 function key(event,side){
  if(disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  const horizontal=['ArrowLeft','ArrowRight'].includes(event.key),edge=CROP_HANDLES[side].find(edge=>['left','right'].includes(edge)===horizontal);if(!edge)return;
  event.preventDefault();event.stopPropagation();const source=imageGeometry(image,value),step=(event.shiftKey?10:1)*(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
  const next=cropFromDrag(image,value,rect,edge,horizontal?step*rect.width/source.width:0,horizontal?0:step*rect.height/source.height);
  callbacks.current.onStart(edge);callbacks.current.onPreview(next.edit);callbacks.current.onEnd(false);
 }
 return <div className="canvas-crop-target" data-canvas-crop style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${image.angle||0}deg)`}}>
  {Object.entries(names).map(([side,label])=><button key={side} data-crop-handle={side} className={`crop-edge-handle ${CROP_HANDLES[side].length===2?'crop-corner-handle':''} crop-edge-${side}`} aria-label={`拖动裁剪${label}`} title={`拖动裁剪${label}`} disabled={disabled} onPointerDown={event=>start(event,side)} onKeyDown={event=>key(event,side)}><span/></button>)}
 </div>;
}
