import {rotateVector} from '../../engine/image-rotation.mjs';
import {useEffect,useRef} from 'react';

// Only the divider DOM moves during a gesture. Source geometry is persisted
// once, after explicit confirmation, by the workspace's shared split engine.
export function CanvasSplitOverlay({image,rect,scale,value,onChange,disabled}){
 const stage=useRef(),line=useRef(),gesture=useRef(),frame=useRef(),latest=useRef(value.at),track=useRef(),release=useRef();
 const {axis,at}=value,size=axis==='x'?image.width:image.height;
 latest.current=at;
 function place(){if(line.current)line.current.style[axis==='x'?'left':'top']=`${latest.current/size*100}%`;}
 function start(event){if(disabled||event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={id:event.pointerId,box:stage.current.getBoundingClientRect(),width:rect.width*scale,height:rect.height*scale};}
 function move(event){const drag=gesture.current;if(!drag||drag.id!==event.pointerId)return;const local=rotateVector(event.clientX-drag.box.x-drag.box.width/2,event.clientY-drag.box.y-drag.box.height/2,-(image.angle||0)),fraction=axis==='x'?local.x/drag.width+.5:local.y/drag.height+.5;latest.current=Math.max(1,Math.min(size-1,Math.round(fraction*size)));if(frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=null;place();});}
 function end(event){if(!gesture.current||gesture.current.id!==event.pointerId)return;const cancelled=event.type==='pointercancel';if(!cancelled)move(event);gesture.current=null;cancelAnimationFrame(frame.current);frame.current=null;if(cancelled)latest.current=at;else onChange({axis,at:latest.current});place();}
 track.current=move;release.current=end;
 useEffect(()=>{const move=e=>track.current(e),end=e=>release.current(e);document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);cancelAnimationFrame(frame.current);};},[]);
 return <div ref={stage} className="canvas-split-target" data-canvas-split style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${image.angle||0}deg)`}}>
  <button ref={line} className={`split-divider split-${axis}`} aria-label="拖动分割线" disabled={disabled||size<2} style={axis==='x'?{left:`${at/size*100}%`}:{top:`${at/size*100}%`}} onPointerDown={start} onKeyDown={event=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(event.key)){event.preventDefault();onChange({axis,at:Math.max(1,Math.min(size-1,at+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)*(event.shiftKey?10:1)))});}}}><span className="split-grip"/></button>
 </div>;
}
