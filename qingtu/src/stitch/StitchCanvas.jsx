import {createPortal} from 'react-dom';
import {rotateVector,rotatedImageBounds} from '../../engine/image-rotation.mjs';
import {resizeImageRect} from '../../engine/canvas-transform.mjs';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {calculateLayout,snapPosition} from '../../engine/stitch-layout.mjs';
import {RESIZE_HANDLES,applyCanvasTransform} from '../../engine/canvas-transform.mjs';
import {snapResizeRect} from '../../engine/transform-snap.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {CanvasSplitOverlay} from './CanvasSplitOverlay.jsx';
import {CornersOut,CornersIn,Minus,Plus,ArrowCounterClockwise} from '@phosphor-icons/react';
import {placeImageControls,fitCanvasViewport,hasOffscreenImages,resizeCanvasViewport} from './canvas-viewport.js';

import {useCanvasNavigation} from './useCanvasNavigation.js';

function emptyCanvasStyle(layout,scale,bounds){
 const width=Math.min(layout.width*scale,bounds.width),height=Math.min(layout.height*scale,bounds.height);
 return {'--empty-width':'232px','--empty-height':'218px','--empty-scale':.9*Math.min(width/232,height/218)};
}

export function StitchCanvas({project:sourceProject,layout:sourceLayout,onChange,onResizePreview,onEdit,onContext,onReorder,selected,onSelect,disabled,navigationTarget,navigationDisabled=disabled,preview,children,viewportMode,split,onSplitChange,splitDisabled,cropping,rotationOpen,cropGesture,guides:cropGuides=[],renderControls}){
 const area=useRef(),canvas=useRef(),viewportSizing=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),moveRef=useRef(),endRef=useRef(),cropView=useRef(),[bounds,setBounds]=useState({width:600,height:360,left:0,top:0,windowHeight:window.innerHeight}),[resizeDraft,setResizeDraft]=useState(null),[overview,setOverview]=useState(null),[navigationHost,setNavigationHost]=useState(null);
 useLayoutEffect(()=>{const host=navigationTarget?.current||null;if(host!==navigationHost)setNavigationHost(host);});
 const controlNodes=useRef(),registerControls=useCallback(nodes=>{controlNodes.current=nodes;},[]);
 const project=resizeDraft||sourceProject,layout=useMemo(()=>resizeDraft?calculateLayout(resizeDraft,{draft:true}):sourceLayout,[resizeDraft,sourceLayout]);
 flushRef.current=(cancelled=false)=>finish(cancelled);moveRef.current=move;endRef.current=end;
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useLayoutEffect(()=>{
  const measure=()=>{
   const rect=area.current.getBoundingClientRect();
   if(rect.width&&rect.height)setBounds({width:rect.width,height:rect.height,left:rect.left,top:rect.top,windowHeight:window.innerHeight,navigation:navigationHost?.getBoundingClientRect()});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(area.current);
  if(navigationHost)observer.observe(navigationHost);
  window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);};
 },[navigationHost]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 useEffect(()=>{
  const track=e=>moveRef.current(e),release=e=>endRef.current(e),cancel=e=>endRef.current(e,true);
  const shift=e=>{const g=gesture.current;if(g&&e.key==='Escape'){e.preventDefault();e.stopPropagation();flushRef.current(true);}else if(g&&e.key==='Shift'){g.shift=e.type==='keydown';moveRef.current({pointerId:g.pointerId,clientX:g.lastX,clientY:g.lastY,shiftKey:g.shift});}};
  document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',shift);document.addEventListener('keyup',shift);
  return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',shift);document.removeEventListener('keyup',shift);};
 },[]);
 const includeImages=project.layout==='free'&&overview===project.id;
 const viewOptions={hasImages:!!project.images.length,editor:split?'split':rotationOpen?'rotate':cropping?'crop':null,includeImages};
 const fit=layout?fitCanvasViewport(bounds,layout,viewOptions):{scale:1,offsetX:0,offsetY:0};
 // Inspector state may change before ResizeObserver delivers its new bounds;
 // use current window dimensions so that later callbacks cannot reapply an old cap.
 const sizing=layout?resizeCanvasViewport(viewportSizing.current,{key:[project.id,layout.width,layout.height,viewportMode,viewOptions.hasImages,includeImages].join(':'),width:window.innerWidth,height:window.innerHeight,scale:fit.scale}):null;
 const fittedView=layout?fitCanvasViewport(bounds,layout,{...viewOptions,maxScale:sizing.maxScale}):fit;
 useLayoutEffect(()=>{viewportSizing.current=sizing;});
 const navigation=useCanvasNavigation({area,projectId:project.id,bounds,fit:fittedView,blocked:navigationDisabled||cropGesture||!!resizeDraft}),naturalView=navigation.view;
 const canReveal=layout&&project.layout==='free'&&(includeImages||hasOffscreenImages(bounds,layout,naturalView));
 if(cropGesture&&!cropView.current)cropView.current={...naturalView,width:layout.width,height:layout.height};
 if(!cropGesture)cropView.current=null;
 const view=resizeDraft?gesture.current?.view:cropView.current,scale=view?.scale||naturalView.scale,offsetX=(view?.offsetX??naturalView.offsetX)+(view?(layout.width-view.width)*scale/2:0),offsetY=(view?.offsetY??naturalView.offsetY)+(view?(layout.height-view.height)*scale/2:0);
 const selectedRect=layout?.rects.find(rect=>rect.id===selected),selectedImage=project.images.find(image=>image.id===selected);
 function editAt(event,id){const r=event.currentTarget.getBoundingClientRect();onEdit(id,event.type==='dblclick'&&(event.clientX||event.clientY)?{x:event.clientX,y:event.clientY}:{x:r.x+r.width/2,y:r.y+r.height/2});}
 function showRect(element,rect){if(element)Object.assign(element.style,{left:rect.x*scale+'px',top:rect.y*scale+'px',width:rect.width*scale+'px',height:rect.height*scale+'px'});}
 function imageControlsAt(rect,origin){
  const displayed=rotatedImageBounds(rect,selectedImage?.angle||0);
  return placeImageControls(bounds,{
   x:origin.left+displayed.x*scale,y:origin.top+displayed.y*scale,
   width:displayed.width*scale,height:displayed.height*scale,
  },viewOptions.editor);
 }
 function showControls(rect){
  const nodes=controlNodes.current;if(!nodes)return;
  const {tools}=imageControlsAt(rect,canvas.current.getBoundingClientRect());
  if(nodes.tools)Object.assign(nodes.tools.style,{left:tools.left+'px',top:tools.top+'px'});
 }
 function start(event,rect,handle=null){
  if(disabled||event.button!==0)return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);canvas.current.querySelector(`[data-image-id="${rect.id}"]`)?.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
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
   else {showRect(g.element,rect);showRect(g.ghost,rect);showRect(canvas.current.querySelector('.stitch-selection'),rect);showControls(rect);}
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
   if(g.reorder){const target=dropTarget(g),indicator=canvas.current.querySelector('.reorder-indicator');indicator.hidden=!target||target.id===g.id;if(target)Object.assign(indicator.style,{left:target.x*scale+'px',top:target.y*scale+'px',width:target.width*scale+'px',height:target.height*scale+'px'});}
  });
 }
 function nextRect(g){
  const angle=g.project.images.find(image=>image.id===g.id)?.angle||0;
  if(g.handle&&angle){const local=rotateVector(g.dx||0,g.dy||0,-angle),next=resizeImageRect(g.rect,g.handle,local.x,local.y,g.shift),delta=rotateVector(next.x+next.width/2-g.rect.x-g.rect.width/2,next.y+next.height/2-g.rect.y-g.rect.height/2,angle);return {...next,x:g.rect.x+g.rect.width/2+delta.x-next.width/2,y:g.rect.y+g.rect.height/2+delta.y-next.height/2,guides:[]};}
  if(g.handle)return snapResizeRect(g.rect,g.handle,g.dx||0,g.dy||0,g.targets,8/g.scale,g.shift,g.project.heightLocked&&g.project.layout==='horizontal'?rect=>({...rect,x:g.rect.x}):undefined);
  // Reorder only when dropping onto a different image; within the same slot
  // (or an empty area), move with normal edge/centre snapping.
  if(g.reorder){const target=dropTarget(g);if(target&&target.id!==g.id)return {...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)};}
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},g.targets,8/g.scale)};
 }
 function dropTarget(g){
  const box=canvas.current.getBoundingClientRect(),x=(g.lastX-box.left)/g.scale,y=(g.lastY-box.top)/g.scale;
  return g.layout.rects.filter(rect=>{const angle=g.project.images.find(image=>image.id===rect.id)?.angle||0,local=rotateVector(x-rect.x-rect.width/2,y-rect.y-rect.height/2,-angle);return Math.abs(local.x)<=rect.width/2&&Math.abs(local.y)<=rect.height/2;}).at(-1)||null;
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
  if(!g.handle){showRect(g.element,g.rect);showRect(g.ghost,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);showControls(g.rect);}
  if(cancelled||Math.hypot((g.dx||0)*g.scale,(g.dy||0)*g.scale)<3)return;
  if(g.reorder){const target=dropTarget(g);if(target&&target.id!==g.id)return onReorder(g.id,target.id);}
  const {x,y,width,height}=rect;return onChange({...g.project.positions,[g.id]:{x,y,width,height}},g.handle?'resize':'move');
 }
 function renderLayer(rect,ghost=false){
     const image=project.images.find(i=>i.id===rect.id);
     return <div data-image-id={!ghost?rect.id:undefined} data-ghost-image-id={ghost?rect.id:undefined} data-canvas-split={split?.id===rect.id?'':undefined} className={`${ghost?'stitch-ghost':'stitch-layer'} movable ${selected===rect.id?'selected':''}`} key={rect.id} style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${image.angle||0}deg)`}} tabIndex={ghost?undefined:0} role={ghost?undefined:'button'} aria-label={ghost?undefined:`编辑 ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>start(e,rect)} onClick={()=>onSelect(rect.id)} onContextMenu={event=>{event.preventDefault();if(!disabled)onContext(rect.id,{x:event.clientX,y:event.clientY});}} onDoubleClick={event=>{if(!disabled)editAt(event,rect.id);}} onKeyDown={event=>{
      if(disabled)return;
      if(event.key==='Enter'){event.preventDefault();editAt(event,rect.id);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      if(event.altKey){const index=project.images.findIndex(image=>image.id===rect.id),target=project.images[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(target)onReorder(rect.id,target.id);return;}
      const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
     }}>
      <img src={image.preview} alt="" draggable={false} style={rect.crop?{position:'absolute',maxWidth:'none',width:`${100/(1-rect.crop.left-rect.crop.right)}%`,height:`${100/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`,left:`${-100*rect.crop.left/(1-rect.crop.left-rect.crop.right)}%`,top:`${-100*(rect.crop.top||0)/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`}:undefined}/>
     </div>;
 }
 return <div className="stitch-canvas-area" ref={area} tabIndex={-1} onPointerDown={event=>{
  if(disabled||event.button!==0||event.target.closest('.stitch-layer,.stitch-ghost,.stitch-selection,.inline-image-controls,.inline-image-tools,[data-canvas-split],.canvas-view-fit,.canvas-viewport-controls,.inline-image-editor'))return;
  onSelect?.(null);event.currentTarget.focus({preventScroll:true});
 }}>
  {layout?<div ref={canvas} className={`stitch-canvas ${preview?'has-output-preview':''}`} data-interacting={resizeDraft?'true':undefined} data-crop-gesture={cropGesture?'true':undefined} data-canvas-width={layout.width} data-canvas-height={layout.height} style={{...(!project.images.length&&emptyCanvasStyle(layout,scale,bounds)),width:layout.width*scale,height:layout.height*scale,transform:`translate(${offsetX}px,${offsetY}px)`}}>
   <div className="stitch-ghosts" aria-hidden>{layout.rects.filter(rect=>rect.id===selected).map(rect=>renderLayer(rect,true))}</div>
   <div className="stitch-content">
    {children}
    {preview&&<img className="stitch-output-preview" src={preview} alt="实际导出预览" draggable={false}/>}
    {layout.rects.map(rect=>renderLayer(rect))}
    <div className="snap-guides" aria-hidden/>
   </div>
   <div className="stitch-canvas-edge" aria-hidden/>
   {selectedRect&&!split&&!cropping&&!rotationOpen&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale,transform:`rotate(${selectedImage.angle||0}deg)`}}>
    {RESIZE_HANDLES.map(handle=><button key={handle} data-handle={handle} className={`resize-handle handle-${handle}`} aria-label={`缩放 ${selectedImage.name} ${handle}`} title="拖动缩放 · Shift 自由比例" disabled={disabled} onPointerDown={e=>start(e,selectedRect,handle)}/>)}
   </div>}
   {split&&selectedRect&&<CanvasSplitOverlay image={selectedImage} rect={selectedRect} scale={scale} value={split} onChange={onSplitChange} disabled={splitDisabled}/>}
   <div className="reorder-indicator" hidden/>
   <div className="snap-guides crop-snap-guides" aria-hidden>{cropGuides.map((line,index)=><span key={index} className={`snap-guide ${line.axis}`} style={{[line.axis==='x'?'left':'top']:line.value*scale}}/>)}</div>
   {selectedRect&&renderControls&&renderControls((()=>{
    const origin={left:bounds.left+(bounds.width-layout.width*scale)/2+offsetX,top:bounds.top+(bounds.height-layout.height*scale)/2+offsetY};
    return {project,origin,bounds,registerElements:registerControls,targets:[...layout.rects.filter(rect=>rect.id!==selected),{x:0,y:0,width:layout.width,height:layout.height,edgesOnly:true}],rect:selectedRect,scale,...imageControlsAt(selectedRect,origin)};
   })())}
  </div>:<div className="stitch-invalid">请调整画布</div>}
  {layout&&navigationHost&&createPortal(<div className="canvas-viewport-controls" role="group" aria-label="显示区域操作"><button aria-label="缩小视图" title="缩小视图" disabled={navigationDisabled||cropGesture||!!resizeDraft||navigation.zoom<=.1} onClick={()=>navigation.step(-1)}><Minus size={15}/></button>
   <output aria-label="视图缩放比例" title="Ctrl/Cmd + 滚轮居中缩放">{Math.round(navigation.zoom*100)}%</output>
   <button aria-label="放大视图" title="放大视图" disabled={navigationDisabled||cropGesture||!!resizeDraft||navigation.zoom>=8} onClick={()=>navigation.step(1)}><Plus size={15}/></button>
   <button aria-label="复位视图" title="复位视图 · 适应画布" disabled={navigationDisabled||cropGesture||!!resizeDraft} onClick={navigation.reset}><ArrowCounterClockwise size={16}/></button>
  </div>,navigationHost)}
  {canReveal&&<button className="canvas-view-fit" aria-label={includeImages?'聚焦画布':'显示全部图片'} disabled={disabled||cropping||rotationOpen||!!split||!!resizeDraft} onClick={()=>{navigation.reset();setOverview(includeImages?null:project.id);}}>{includeImages?<CornersIn size={16}/>:<CornersOut size={16}/>}<span>{includeImages?'聚焦画布':'显示全部'}</span></button>}
 </div>;
}
