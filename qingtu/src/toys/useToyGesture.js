import {useEffect,useRef,useState} from 'react';

const motionThreshold=3;

export function useToyGesture(kind,native){
 const gesture=useRef(null),[dragging,setDragging]=useState(false);
 function finish(){
  const current=gesture.current;
  if(!current)return;
  gesture.current=null;
  native.drag('end');
  if(current.moved)setDragging(false);
 }
 useEffect(()=>{
  window.addEventListener('blur',finish);
  return ()=>{window.removeEventListener('blur',finish);finish();};
 },[kind]);

 function down(event){
  if(event.button!==0||gesture.current)return;
  const toy=event.currentTarget.querySelector('.toy-artwork');
  if(!toy)return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={toy,id:event.pointerId,x:event.screenX,y:event.screenY,moved:false};
  native.drag('start',event.screenX,event.screenY);
 }
 function dragTo(current,event){
  if(!current.moved){
   if(Math.hypot(event.screenX-current.x,event.screenY-current.y)<motionThreshold)return;
   current.moved=true;
   setDragging(true);
  }
  native.drag('move',event.screenX,event.screenY);
 }
 function move(event){
  const current=gesture.current;
  if(current?.id!==event.pointerId)return;
  event.stopPropagation();
  if(!(event.buttons&1)){finish();return;}
  if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);
  dragTo(current,event);
 }
 function up(event){
  const current=gesture.current;
  if(current?.id!==event.pointerId)return;
  event.stopPropagation();
  dragTo(current,event);
  finish();
  if(current.moved)return;
  const button=current.toy.shadowRoot?.querySelector('button');
  button?.focus({preventScroll:true});
  if(kind==='button')current.toy.impact?.(.2);
  else if(kind==='toggle')button?.click();
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
