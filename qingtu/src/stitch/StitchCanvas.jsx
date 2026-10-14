import {useEffect,useRef,useState} from 'react';
import {snapPosition} from '../../engine/stitch-layout.mjs';
import {RESIZE_HANDLES,resizeImageRect} from '../../engine/canvas-transform.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {CanvasSplitOverlay} from './CanvasSplitOverlay.jsx';

export function StitchCanvas({project,layout,onChange,onEdit,onContext,onRemove,onReorder,selected,onSelect,disabled,preview,children,split,onSplitChange,splitDisabled}){
 const area=useRef(),canvas=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),moveRef=useRef(),endRef=useRef(),[bounds,setBounds]=useState({width:600,height:360});
 flushRef.current=()=>finish(false);moveRef.current=move;endRef.current=end;
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>setBounds(entries[0].contentRect));observer.observe(area.current);return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};},[]);
 useEffect(()=>{
  const track=e=>moveRef.current(e),release=e=>endRef.current(e),cancel=e=>endRef.current(e,true);
  const shift=e=>{const g=gesture.current;if(g&&e.key==='Shift'){g.shift=e.type==='keydown';moveRef.current({pointerId:g.pointerId,clientX:g.lastX,clientY:g.lastY,shiftKey:g.shift});}};
  document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',shift);document.addEventListener('keyup',shift);
  return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',shift);document.removeEventListener('keyup',shift);};
 },[]);
 const scale=layout?Math.max(.000001,Math.min((bounds.width-50)/layout.width,(bounds.height-35)/layout.height)):1;
 const selectedRect=layout?.rects.find(rect=>rect.id===selected),selectedImage=project.images.find(image=>image.id===selected);
 function editAt(event,id){const r=event.currentTarget.getBoundingClientRect();onEdit(id,event.type==='dblclick'&&(event.clientX||event.clientY)?{x:event.clientX,y:event.clientY}:{x:r.x+r.width/2,y:r.y+r.height/2});}
 function showRect(element,rect){if(element)Object.assign(element.style,{left:rect.x*scale+'px',top:rect.y*scale+'px',width:rect.width*scale+'px',height:rect.height*scale+'px'});}
 function start(event,rect,handle=null){
  if(disabled||event.button!==0)return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:rect.id,rect,handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,shift:event.shiftKey,element:canvas.current.querySelector(`[data-image-id="${rect.id}"]`),ghost:canvas.current.querySelector(`[data-ghost-image-id="${rect.id}"]`)};
 }
 function move(event){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId)return;
  g.lastX=event.clientX;g.lastY=event.clientY;g.dx=(event.clientX-g.startX)/scale;g.dy=(event.clientY-g.startY)/scale;g.shift=event.shiftKey;
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;if(gesture.current!==g)return;
   canvas.current.dataset.interacting='true';const rect=nextRect(g);showRect(g.element,rect);showRect(g.ghost,rect);showRect(canvas.current.querySelector('.stitch-selection'),rect);
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
  });
 }
 function nextRect(g){
  if(g.handle)return resizeImageRect(g.rect,g.handle,g.dx||0,g.dy||0,g.shift);
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},[...layout.rects.filter(r=>r.id!==g.id),{x:0,y:0,width:layout.width,height:layout.height}],8/scale)};
 }
 function end(event,cancelled=false){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId)return;
  if(!cancelled){g.dx=(event.clientX-g.startX)/scale;g.dy=(event.clientY-g.startY)/scale;g.shift=event.shiftKey;}
  return finish(cancelled);
 }
 function finish(cancelled){
  const g=gesture.current;if(!g)return;
  cancelAnimationFrame(frame.current);frame.current=null;gesture.current=null;
  delete canvas.current.dataset.interacting;canvas.current.querySelector('.snap-guides').replaceChildren();
  const rect=nextRect(g);
  if(cancelled||Math.hypot((g.dx||0)*scale,(g.dy||0)*scale)<3){showRect(g.element,g.rect);showRect(g.ghost,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);return;}
  const {x,y,width,height}=rect;return onChange({...project.positions,[g.id]:{x,y,width,height}});
 }
 function renderLayer(rect,ghost=false){
     const image=project.images.find(i=>i.id===rect.id);
     return <div data-image-id={!ghost?rect.id:undefined} data-ghost-image-id={ghost?rect.id:undefined} data-canvas-split={split?.id===rect.id?'':undefined} className={`${ghost?'stitch-ghost':'stitch-layer'} movable ${selected===rect.id?'selected':''}`} key={rect.id} style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale}} tabIndex={ghost?undefined:0} role={ghost?undefined:'button'} aria-label={ghost?undefined:`编辑 ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>start(e,rect)} onClick={()=>onSelect(rect.id)} onContextMenu={event=>{event.preventDefault();if(!disabled)onContext(rect.id,{x:event.clientX,y:event.clientY});}} onDoubleClick={event=>{if(!disabled)editAt(event,rect.id);}} onKeyDown={event=>{
      if(disabled)return;
      if(event.key==='Enter'){event.preventDefault();editAt(event,rect.id);return;}
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();onRemove(rect.id);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      if(event.altKey){const index=project.images.findIndex(image=>image.id===rect.id),target=project.images[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(target)onReorder(rect.id,target.id);return;}
      const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
     }}>
      <img src={image.preview} alt="" draggable={false} style={rect.crop?{position:'absolute',maxWidth:'none',width:`${100/(1-rect.crop.left-rect.crop.right)}%`,height:`${100/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`,left:`${-100*rect.crop.left/(1-rect.crop.left-rect.crop.right)}%`,top:`${-100*(rect.crop.top||0)/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`}:undefined}/>
     </div>;
 }
 return <div className="stitch-canvas-area" ref={area}>
  {layout?<div ref={canvas} className={`stitch-canvas ${preview?'has-output-preview':''}`} data-canvas-width={layout.width} data-canvas-height={layout.height} style={{width:layout.width*scale,height:layout.height*scale}}>
   <div className="stitch-ghosts" aria-hidden>{layout.rects.map(rect=>renderLayer(rect,true))}</div>
   <div className="stitch-content">
    {children}
    {preview&&<img className="stitch-output-preview" src={preview} alt="实际导出预览" draggable={false}/>}
    {layout.rects.map(rect=>renderLayer(rect))}
    <div className="snap-guides" aria-hidden/>
   </div>
   <div className="stitch-canvas-edge" aria-hidden/>
   {selectedRect&&!split&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale}}>
    {RESIZE_HANDLES.map(handle=><button key={handle} data-handle={handle} className={`resize-handle handle-${handle}`} aria-label={`缩放 ${selectedImage.name} ${handle}`} title="拖动缩放 · Shift 自由比例" disabled={disabled} onPointerDown={e=>start(e,selectedRect,handle)}/>)}
   </div>}
   {split&&selectedRect&&<CanvasSplitOverlay image={selectedImage} rect={selectedRect} scale={scale} value={split} onChange={onSplitChange} disabled={splitDisabled}/>}
  </div>:<div className="stitch-invalid">请调整画布</div>}
 </div>;
}
