import {useEffect,useMemo,useRef,useState} from 'react';
import {calculateLayout,snapPosition} from '../../engine/stitch-layout.mjs';
import {RESIZE_HANDLES,applyCanvasTransform} from '../../engine/canvas-transform.mjs';
import {snapResizeRect} from '../../engine/transform-snap.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {CanvasSplitOverlay} from './CanvasSplitOverlay.jsx';
import {CornersOut,CornersIn} from '@phosphor-icons/react';
import {CONTROL_PANEL_HEIGHT,fitCanvasViewport,hasOffscreenImages} from './canvas-viewport.js';

export function StitchCanvas({project:sourceProject,layout:sourceLayout,onChange,onResizePreview,onEdit,onContext,onRemove,onReorder,selected,onSelect,disabled,preview,children,split,onSplitChange,splitDisabled,cropping,cropGesture,guides:cropGuides=[],renderControls}){
 const area=useRef(),canvas=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),moveRef=useRef(),endRef=useRef(),cropView=useRef(),[bounds,setBounds]=useState({width:600,height:360}),[resizeDraft,setResizeDraft]=useState(null),[overview,setOverview]=useState(null);
 const project=resizeDraft||sourceProject,layout=useMemo(()=>resizeDraft?calculateLayout(resizeDraft,{draft:true}):sourceLayout,[resizeDraft,sourceLayout]);
 flushRef.current=(cancelled=false)=>finish(cancelled);moveRef.current=move;endRef.current=end;
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;if(rect.width>0&&rect.height>0)setBounds(rect);});observer.observe(area.current);return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};},[]);
 useEffect(()=>{
  const track=e=>moveRef.current(e),release=e=>endRef.current(e),cancel=e=>endRef.current(e,true);
  const shift=e=>{const g=gesture.current;if(g&&e.key==='Escape'){e.preventDefault();e.stopPropagation();flushRef.current(true);}else if(g&&e.key==='Shift'){g.shift=e.type==='keydown';moveRef.current({pointerId:g.pointerId,clientX:g.lastX,clientY:g.lastY,shiftKey:g.shift});}};
  document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',shift);document.addEventListener('keyup',shift);
  return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',shift);document.removeEventListener('keyup',shift);};
 },[]);
 const includeImages=project.layout==='free'&&overview===project.id;
 const naturalView=layout?fitCanvasViewport(bounds,layout,{hasImages:!!project.images.length,editor:split?'split':cropping?'crop':null,includeImages}):{scale:1,offsetX:0,offsetY:0};
 const canReveal=layout&&project.layout==='free'&&(includeImages||hasOffscreenImages(bounds,layout,naturalView));
 if(cropGesture&&!cropView.current)cropView.current={...naturalView,width:layout.width,height:layout.height};
 if(!cropGesture)cropView.current=null;
 const view=resizeDraft?gesture.current?.view:cropView.current,scale=view?.scale||naturalView.scale,offsetX=(view?.offsetX??naturalView.offsetX)+(view?(layout.width-view.width)*scale/2:0),offsetY=(view?.offsetY??naturalView.offsetY)+(view?(layout.height-view.height)*scale/2:0);
 const selectedRect=layout?.rects.find(rect=>rect.id===selected),selectedImage=project.images.find(image=>image.id===selected);
 function editAt(event,id){const r=event.currentTarget.getBoundingClientRect();onEdit(id,event.type==='dblclick'&&(event.clientX||event.clientY)?{x:event.clientX,y:event.clientY}:{x:r.x+r.width/2,y:r.y+r.height/2});}
 function showRect(element,rect){if(element)Object.assign(element.style,{left:rect.x*scale+'px',top:rect.y*scale+'px',width:rect.width*scale+'px',height:rect.height*scale+'px'});}
 function start(event,rect,handle=null){
  if(disabled||event.button!==0)return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:rect.id,rect,handle,project,layout,view:{scale,offsetX,offsetY,width:layout.width,height:layout.height},scale,targets:[...layout.rects.filter(r=>r.id!==rect.id),{x:0,y:0,width:layout.width,height:layout.height,edgesOnly:true}],reorder:!handle&&project.layout!=='free',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,shift:event.shiftKey,element:canvas.current.querySelector(`[data-image-id="${rect.id}"]`),ghost:canvas.current.querySelector(`[data-ghost-image-id="${rect.id}"]`)};
 }
 function move(event){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId||event.buttons===0)return;
  g.lastX=event.clientX;g.lastY=event.clientY;g.dx=(event.clientX-g.startX)/g.scale;g.dy=(event.clientY-g.startY)/g.scale;g.shift=event.shiftKey;
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;if(gesture.current!==g)return;
   canvas.current.dataset.interacting='true';const rect=nextRect(g);
   if(g.handle){const {x,y,width,height}=rect,next=applyCanvasTransform(g.project,{...g.project.positions,[g.id]:{x,y,width,height}},'resize');setResizeDraft(next);onResizePreview?.(next.canvas);}
   else {showRect(g.element,rect);showRect(g.ghost,rect);showRect(canvas.current.querySelector('.stitch-selection'),rect);}
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
   if(g.reorder){const target=dropTarget(g),indicator=canvas.current.querySelector('.reorder-indicator');indicator.hidden=!target||target.id===g.id;if(target)Object.assign(indicator.style,{left:target.x*scale+'px',top:target.y*scale+'px',width:target.width*scale+'px',height:target.height*scale+'px'});}
  });
 }
 function nextRect(g){
  if(g.handle)return snapResizeRect(g.rect,g.handle,g.dx||0,g.dy||0,g.targets,8/g.scale,g.shift,g.project.heightLocked&&g.project.layout==='horizontal'?rect=>({...rect,x:g.rect.x}):undefined);
  if(g.reorder)return {...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)};
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},g.targets,8/g.scale)};
 }
 function dropTarget(g){
  const box=canvas.current.getBoundingClientRect(),x=(g.lastX-box.left)/g.scale,y=(g.lastY-box.top)/g.scale;
  const hit=g.layout.rects.filter(rect=>x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height).at(-1);if(hit)return hit;
  return g.layout.rects.reduce((best,rect)=>{const distance=Math.hypot(x-rect.x-rect.width/2,y-rect.y-rect.height/2);return !best||distance<best.distance?{...rect,distance}:best;},null);
 }
 function end(event,cancelled=false){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId)return;
  if(!cancelled){g.lastX=event.clientX;g.lastY=event.clientY;g.dx=(event.clientX-g.startX)/g.scale;g.dy=(event.clientY-g.startY)/g.scale;g.shift=event.shiftKey;}
  return finish(cancelled);
 }
 function finish(cancelled){
  const g=gesture.current;if(!g)return;
  cancelAnimationFrame(frame.current);frame.current=null;gesture.current=null;setResizeDraft(null);if(g.handle)onResizePreview?.(null);
  delete canvas.current.dataset.interacting;canvas.current.querySelector('.snap-guides').replaceChildren();
  canvas.current.querySelector('.reorder-indicator').hidden=true;
  const rect=nextRect(g);
  // React skips unchanged style properties. Restore every temporary gesture
  // value before committing, including axes the final layout keeps unchanged.
  if(!g.handle){showRect(g.element,g.rect);showRect(g.ghost,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);}
  if(cancelled||Math.hypot((g.dx||0)*g.scale,(g.dy||0)*g.scale)<3)return;
  if(g.reorder){const target=dropTarget(g);if(target&&target.id!==g.id)return onReorder(g.id,target.id);return;}
  const {x,y,width,height}=rect;return onChange({...g.project.positions,[g.id]:{x,y,width,height}},g.handle?'resize':'move');
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
  {layout?<div ref={canvas} className={`stitch-canvas ${preview?'has-output-preview':''}`} data-interacting={resizeDraft?'true':undefined} data-crop-gesture={cropGesture?'true':undefined} data-canvas-width={layout.width} data-canvas-height={layout.height} style={{width:layout.width*scale,height:layout.height*scale,transform:`translate(${offsetX}px,${offsetY}px)`}}>
   <div className="stitch-ghosts" aria-hidden>{layout.rects.map(rect=>renderLayer(rect,true))}</div>
   <div className="stitch-content">
    {children}
    {preview&&<img className="stitch-output-preview" src={preview} alt="实际导出预览" draggable={false}/>}
    {layout.rects.map(rect=>renderLayer(rect))}
    <div className="snap-guides" aria-hidden/>
   </div>
   <div className="stitch-canvas-edge" aria-hidden/>
   {selectedRect&&!split&&!cropping&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale}}>
    {RESIZE_HANDLES.map(handle=><button key={handle} data-handle={handle} className={`resize-handle handle-${handle}`} aria-label={`缩放 ${selectedImage.name} ${handle}`} title="拖动缩放 · Shift 自由比例" disabled={disabled} onPointerDown={e=>start(e,selectedRect,handle)}/>)}
   </div>}
   {split&&selectedRect&&<CanvasSplitOverlay image={selectedImage} rect={selectedRect} scale={scale} value={split} onChange={onSplitChange} disabled={splitDisabled}/>}
   <div className="reorder-indicator" hidden/>
   <div className="snap-guides crop-snap-guides" aria-hidden>{cropGuides.map((line,index)=><span key={index} className={`snap-guide ${line.axis}`} style={{[line.axis==='x'?'left':'top']:line.value*scale}}/>)}</div>
   {selectedRect&&renderControls&&renderControls((()=>{const left=(bounds.width-layout.width*scale)/2+offsetX,top=(bounds.height-layout.height*scale)/2+offsetY,clamp=(value,min,max)=>Math.max(min,Math.min(max,value)),x=selectedRect.x*scale,y=selectedRect.y*scale,width=selectedRect.width*scale,height=selectedRect.height*scale;return {project,targets:[...layout.rects.filter(rect=>rect.id!==selected),{x:0,y:0,width:layout.width,height:layout.height,edgesOnly:true}],rect:selectedRect,scale,tools:{left:clamp(x+(width-154)/2,8-left,bounds.width-left-162),top:clamp(y-43,8-top,bounds.height-top-43)},panel:{left:clamp(x+(split?width-300:(width-300)/2),8-left,bounds.width-left-308),top:clamp(y+height+10,48-top,bounds.height-top-CONTROL_PANEL_HEIGHT[split?'split':'crop']-8)}};})())}
  </div>:<div className="stitch-invalid">请调整画布</div>}
  {canReveal&&<button className="canvas-view-fit" aria-label={includeImages?'聚焦画布':'显示全部图片'} disabled={disabled||cropping||!!split||!!resizeDraft} onClick={()=>setOverview(includeImages?null:project.id)}>{includeImages?<CornersIn size={16}/>:<CornersOut size={16}/>}<span>{includeImages?'聚焦画布':'显示全部'}</span></button>}
 </div>;
}
