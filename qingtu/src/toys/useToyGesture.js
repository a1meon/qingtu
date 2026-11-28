import {useEffect,useRef,useState} from 'react';
import {toyHit} from './toy-hit.js';

// A click may wobble a few pixels (high-DPI mice, touchpads); only a clear
// movement turns a press into a drag, so clicks still play the toy.
const motionThreshold=7;


export function useToyGesture(kind,native){
 const gesture=useRef(null),[dragging,setDragging]=useState(false);
 function finish(released=false){
  const current=gesture.current;
  if(!current)return;
  gesture.current=null;
  // Any ending other than a clean release (blur, lost press) stops the toy's
  // press too, so nothing stays squashed or keeps firing.
  if(!released&&!current.moved)current.toy.cancelPress?.();
  try{if(current.target?.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);}catch{}
  if(current.moved){
   native.drag('end');
   setDragging(false);
  }
 }
 useEffect(()=>{
  // Bubble phase: only mouse-ups the toy itself did not handle (released
  // outside it) end the press here.
  const release=event=>{if(gesture.current&&!(event.buttons&1))finish();};
  const abort=()=>finish();
  const stop=native.onDragCancel?.(abort);
  window.addEventListener('blur',abort);
  window.addEventListener('pointerup',release);
  document.addEventListener('visibilitychange',abort);
  return ()=>{
   window.removeEventListener('blur',abort);window.removeEventListener('pointerup',release);
   document.removeEventListener('visibilitychange',abort);stop?.();finish();
  };
 },[kind]);

 function down(event){
  if(event.button!==0||gesture.current)return;
  const toy=event.currentTarget.querySelector('.toy-artwork');
  // Only a press on the painted artwork starts a gesture; transparent space
  // in the window never drags it.
  if(!toy||!toy.contains(event.target)||!toyHit(toy,event.clientX,event.clientY))return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={toy,target:event.currentTarget,id:event.pointerId,x:event.screenX,y:event.screenY,moved:false};
  // 轻图's own toys react on press (squash, pop, shutter) and on release.
  toy.press?.(event.clientX,event.clientY);
 }
 function dragTo(current,event){
  if(!current.moved){
   if(Math.hypot(event.screenX-current.x,event.screenY-current.y)<motionThreshold)return;
   current.moved=true;
   current.toy.cancelPress?.();
   setDragging(true);
   native.drag('start',current.x,current.y);
  }
  native.drag('move',event.screenX,event.screenY);
 }
 function move(event){
  const current=gesture.current;
  if(current?.id!==event.pointerId)return;
  event.stopPropagation();
  if(!(event.buttons&1)){finish();return;}
  // A press whose mouse-up was lost (another app's global mouse hook on
  // Windows can swallow it) keeps the pointer captured; later presses far
  // away would then drag the toy. A real drag starts on the toy, so a pointer
  // outside the window before any drag began ends the stale press.
  if(!current.moved&&(event.clientX<0||event.clientY<0||event.clientX>innerWidth||event.clientY>innerHeight)){finish();return;}
  if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);
  dragTo(current,event);
 }
 function up(event){
  const current=gesture.current;
  if(current?.id!==event.pointerId)return;
  event.stopPropagation();
  if(current.moved)dragTo(current,event);
  finish(true);
  if(current.moved)return;
  current.toy.shadowRoot?.querySelector('button')?.focus({preventScroll:true});
  current.toy.release?.(event.clientX,event.clientY);
 }
 function cancel(event){if(gesture.current?.id===event.pointerId)finish();}
 function lostCapture(event){if(!(event.buttons&1))cancel(event);}
 function click(event){
  // Pointer interactions are handled on release; keyboard and accessible clicks pass through.
  if(event.detail>0){event.preventDefault();event.stopPropagation();}
 }
 return {dragging,finish,handlers:{onPointerDownCapture:down,onPointerMoveCapture:move,onPointerUpCapture:up,
  onPointerCancelCapture:cancel,onLostPointerCapture:lostCapture,onClickCapture:click}};
}
