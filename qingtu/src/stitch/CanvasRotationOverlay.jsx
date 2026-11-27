import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {createPortal} from 'react-dom';
import {angleFromCornerDrag} from '../../engine/image-rotation.mjs';
import {addFlushHandler} from '../lifecycle.js';
const corners={nw:'左上角',ne:'右上角',se:'右下角',sw:'左下角'};
const cornerAngles={nw:-45,ne:45,se:135,sw:225};
function rotationCursor(angle){
 const path='<path d="M5.4 13.2A11 11 0 0 1 26.6 13.2M3.5 8.5L5.4 13.2L9.3 10.1M22.7 10.1L26.6 13.2L28.5 8.5"/>';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(${angle} 16 16) translate(1 1) scale(.9375)" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="white" stroke-width="3.8">${path}</g><g stroke="#253a49" stroke-width="1.7">${path}</g></g></svg>`;
 return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
}
export const CanvasRotationOverlay=forwardRef(function CanvasRotationOverlay({image,rect,scale,origin,hidden,disabled,onStart,onPreview,onEnd},ref){
 const stage=useRef(),gesture=useRef(),frame=useRef(),callbacks=useRef(),actions=useRef();callbacks.current={onStart,onPreview,onEnd};
 const ray=(x,y,g)=>Math.atan2(y-g.cy,x-g.cx)*180/Math.PI;
 function start(event){
  if(disabled||event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
  const box=stage.current.getBoundingClientRect(),g={id:event.pointerId,cx:box.x+box.width/2,cy:box.y+box.height/2,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,shift:event.shiftKey,distance:0};
  g.angle=callbacks.current.onStart();event.currentTarget.focus({preventScroll:true});g.ray=ray(event.clientX,event.clientY,g);gesture.current=g;
 }
 function update(){const g=gesture.current;if(g&&g.distance>=2)callbacks.current.onPreview(angleFromCornerDrag(g.angle,g.ray,ray(g.lastX,g.lastY,g),g.shift));}
 function move(event){const g=gesture.current;if(!g||g.id!==event.pointerId)return;g.lastX=event.clientX;g.lastY=event.clientY;g.shift=event.shiftKey;g.distance=Math.max(g.distance,Math.hypot(g.lastX-g.x,g.lastY-g.y));if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=null;update();});}
 function finish(cancelled=false){const g=gesture.current;if(!g)return;cancelAnimationFrame(frame.current);frame.current=null;if(!cancelled)update();gesture.current=null;return callbacks.current.onEnd(cancelled||g.distance<2,g.id);}
 function end(event){if(gesture.current?.id!==event.pointerId)return;if(event.type!=='pointercancel')move(event);return finish(event.type==='pointercancel');}
 actions.current={move,end,finish,update};
 useImperativeHandle(ref,()=>({flush:()=>actions.current.finish()}),[]);
 useEffect(()=>addFlushHandler(()=>actions.current.finish()),[]);
 useEffect(()=>{
  const move=e=>actions.current.move(e),end=e=>actions.current.end(e),key=e=>{const g=gesture.current;if(!g)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();actions.current.finish(true);}else if(e.key==='Shift'){g.shift=e.type==='keydown';actions.current.update();}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);document.addEventListener('keydown',key,true);document.addEventListener('keyup',key,true);
  return()=>{cancelAnimationFrame(frame.current);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);document.removeEventListener('keydown',key,true);document.removeEventListener('keyup',key,true);};
 },[]);
 return createPortal(<div hidden={hidden} ref={stage} className="canvas-rotation-target" style={{left:origin.left+rect.x*scale,top:origin.top+rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${rect.angle||0}deg)`}}>
  {Object.entries(corners).map(([corner,label])=><button key={corner} data-rotation-corner={corner} className="rotation-corner-handle" aria-label={`拖动旋转${label}`} title="拖动旋转 · 按住 Shift 每 15° 旋转" disabled={disabled} style={{left:corner.includes('w')?0:'100%',top:corner.includes('n')?0:'100%',cursor:rotationCursor(cornerAngles[corner]+(rect.angle||0))}} onPointerDown={start}/>)}
 </div>,document.body);
});
