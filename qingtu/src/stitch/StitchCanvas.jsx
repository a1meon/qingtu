import {createPortal} from 'react-dom';
import {rotateVector,rotatedImageBounds} from '../../engine/image-rotation.mjs';
import {resizeImageRect} from '../../engine/canvas-transform.mjs';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {calculateLayout,snapPosition} from '../../engine/stitch-layout.mjs';
import {RESIZE_HANDLES,applyCanvasTransform} from '../../engine/canvas-transform.mjs';
import {snapResizeRect} from '../../engine/transform-snap.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {CanvasSplitOverlay} from './CanvasSplitOverlay.jsx';
import {ZoomControls} from '../ZoomControls.jsx';
import {applyCanvasCamera,canvasPanContent,placeImageControls,fitCanvasViewport,resizeCanvasViewport,imageToolbarWidth} from './canvas-viewport.js';

import {useCanvasNavigation} from './useCanvasNavigation.js';
import {hasImageColor} from '../../engine/image-color.mjs';
import {ColorLayer} from './ColorLayer.jsx';
import {Check} from '@phosphor-icons/react';

function emptyCanvasStyle(layout,scale,bounds){
 const width=Math.min(layout.width*scale,bounds.width),height=Math.min(layout.height*scale,bounds.height);
 return {'--empty-width':'232px','--empty-height':'218px','--empty-scale':.9*Math.min(width/232,height/218)};
}

export function StitchCanvas({project:sourceProject,layout:sourceLayout,onChange,onResizePreview,onEdit,onContext,onReorder,selected,onSelect,disabled,navigationTarget,navigationDisabled=disabled,preview,children,viewportMode,viewRevision=0,split,onSplitChange,splitDisabled,cropping,rotationOpen,cropGesture,renderControls,colorMode,showOriginal,colorReference}){
 const area=useRef(),canvas=useRef(),viewportSizing=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),moveRef=useRef(),endRef=useRef(),cropView=useRef(),[bounds,setBounds]=useState({width:600,height:360,left:0,top:0,windowHeight:window.innerHeight}),[resizeDraft,setResizeDraft]=useState(null),[navigationHost,setNavigationHost]=useState(null);
 useLayoutEffect(()=>{const host=navigationTarget?.current||null;if(host!==navigationHost)setNavigationHost(host);});
 const controlNodes=useRef(),registerControls=useCallback(nodes=>{controlNodes.current=nodes;},[]);
 const project=resizeDraft||sourceProject,layout=useMemo(()=>resizeDraft?calculateLayout(resizeDraft,{draft:true}):sourceLayout,[resizeDraft,sourceLayout]);
 flushRef.current=(cancelled=false)=>finish(cancelled);moveRef.current=move;endRef.current=end;
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 const hasImages=sourceProject.images.length>0;
 useLayoutEffect(()=>{
  const header=area.current.closest('.preview-workspace')?.querySelector('.file-toolbar');
  const name=header?.querySelector('.project-name'),actions=header?.querySelector('.preview-actions'),mode=header?.querySelector('.stitch-mode-switch');
  const measure=()=>{
   let toolbarSlot;
   if(name&&actions&&hasImages&&!colorMode){
    const nameBounds=name.getBoundingClientRect(),actionBounds=actions.getBoundingClientRect(),modeBounds=mode?.getBoundingClientRect();
    const left=nameBounds.right+4,right=actionBounds.left-4;
    const slots=modeBounds?[{left,right:modeBounds.left-4},{left:modeBounds.right+4,right}]:[{left,right}];
    const slot=slots.find(({left,right})=>right-left>=imageToolbarWidth);
    header.toggleAttribute('data-tools-row',!slot);
    if(slot)toolbarSlot={...slot,bottom:Math.max(nameBounds.bottom,actionBounds.bottom,modeBounds?.bottom||0)+4};
   }
   const rect=area.current.getBoundingClientRect();
   if(rect.width&&rect.height)setBounds({width:rect.width,height:rect.height,left:rect.left,top:rect.top,toolbarSlot,windowHeight:window.innerHeight,navigation:navigationHost?.getBoundingClientRect()});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(area.current);
  for(const node of [navigationHost,name,actions,mode])if(node)observer.observe(node);
  window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);
  return()=>{observer.disconnect();header?.removeAttribute('data-tools-row');window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);};
 },[navigationHost,hasImages,colorMode]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 useEffect(()=>{
  const track=e=>moveRef.current(e),release=e=>endRef.current(e),cancel=e=>endRef.current(e,true);
  const shift=e=>{const g=gesture.current;if(g&&e.key==='Escape'){e.preventDefault();e.stopPropagation();flushRef.current(true);}else if(g&&e.key==='Shift'){g.shift=e.type==='keydown';moveRef.current({pointerId:g.pointerId,clientX:g.lastX,clientY:g.lastY,shiftKey:g.shift});}};
  document.addEventListener('pointermove',track);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',shift);document.addEventListener('keyup',shift);
  return()=>{document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',shift);document.removeEventListener('keyup',shift);};
 },[]);
 const viewId=project.id+':'+viewRevision;
 const viewOptions={hasImages:!!project.images.length,canvasSizing:project.canvasSizing??'manual',editor:split?'split':rotationOpen?'rotate':cropping?'crop':null};
 const fit=layout?fitCanvasViewport(bounds,layout,viewOptions):{scale:1,offsetX:0,offsetY:0};
 // Inspector state may change before ResizeObserver delivers its new bounds;
 // use current window dimensions so that later callbacks cannot reapply an old cap.
 const sizing=layout?resizeCanvasViewport(viewportSizing.current,{key:[project.id,layout.width,layout.height,viewportMode,viewOptions.hasImages,viewOptions.canvasSizing].join(':'),width:window.innerWidth,height:window.innerHeight,scale:fit.scale}):null;
 const fittedView=layout?fitCanvasViewport(bounds,layout,{...viewOptions,maxScale:sizing.maxScale}):fit;
 useLayoutEffect(()=>{viewportSizing.current=sizing;});
 const selectedRect=layout?.rects.find(rect=>rect.id===selected),selectedImage=project.images.find(image=>image.id===selected);
 const selectionBounds=selectedRect&&rotatedImageBounds(selectedRect,selectedImage?.angle||0);
 const content=canvasPanContent(layout,selectionBounds,fittedView.scale);
 const navigation=useCanvasNavigation({area,projectId:viewId,viewport:bounds,content,blocked:navigationDisabled||cropGesture||!!resizeDraft});
 const naturalView=applyCanvasCamera(fittedView,navigation);
 if(cropGesture&&!cropView.current)cropView.current={...naturalView,width:layout.width,height:layout.height};
 if(!cropGesture)cropView.current=null;
 const view=resizeDraft?gesture.current?.view:cropView.current,scale=view?.scale||naturalView.scale,offsetX=(view?.offsetX??naturalView.offsetX)+(view?(layout.width-view.width)*scale/2:0),offsetY=(view?.offsetY??naturalView.offsetY)+(view?(layout.height-view.height)*scale/2:0);
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
  if(disabled||colorMode||event.button!==0||gesture.current)return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);canvas.current.querySelector(`[data-image-id="${rect.id}"]`)?.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:rect.id,rect,handle,project,layout,view:{scale,offsetX,offsetY,width:layout.width,height:layout.height},scale,targets:[...layout.rects.filter(r=>r.id!==rect.id),{x:0,y:0,width:layout.width,height:layout.height,edgesOnly:true}],reorder:!handle&&project.layout!=='free',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,shift:event.shiftKey,element:canvas.current.querySelector(`[data-image-id="${rect.id}"]`),ghost:canvas.current.querySelector(`[data-ghost-image-id="${rect.id}"]`)};
 }
 function move(event){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId||event.buttons===0)return;
  g.lastX=event.clientX;g.lastY=event.clientY;g.dx=(event.clientX-g.startX)/g.scale;g.dy=(event.clientY-g.startY)/g.scale;g.shift=event.shiftKey;
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;if(gesture.current!==g)return;
   if(g.reorder){
    const dx=g.lastX-g.startX,dy=g.lastY-g.startY;
    if(!canvas.current.dataset.interacting&&Math.hypot(dx,dy)<3)return;
    canvas.current.style.setProperty('--reorder-offset',`${dx}px ${dy}px`);
    canvas.current.dataset.interacting='reorder';
    const indicator=canvas.current.querySelector('.reorder-indicator'),target=dropTarget(g);
    indicator.hidden=!target;
    if(target){
     showRect(indicator,target);
     const image=g.project.images.find(image=>image.id===target.id);
     indicator.style.transform=`rotate(${image.angle||0}deg)`;
    }
    return;
   }
   canvas.current.dataset.interacting='true';const rect=nextRect(g);
   if(g.handle){const {x,y,width,height}=rect,next=applyCanvasTransform(g.project,{...g.project.positions,[g.id]:{x,y,width,height}},'resize');setResizeDraft(next);onResizePreview?.(next.canvas);}
   else {showRect(g.element,rect);showRect(g.ghost,rect);showRect(canvas.current.querySelector('.stitch-selection'),rect);showControls(rect);}
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
  });
 }
 function nextRect(g){
  const angle=g.project.images.find(image=>image.id===g.id)?.angle||0;
  if(g.handle&&angle){const local=rotateVector(g.dx||0,g.dy||0,-angle),next=resizeImageRect(g.rect,g.handle,local.x,local.y,g.shift),delta=rotateVector(next.x+next.width/2-g.rect.x-g.rect.width/2,next.y+next.height/2-g.rect.y-g.rect.height/2,angle);return {...next,x:g.rect.x+g.rect.width/2+delta.x-next.width/2,y:g.rect.y+g.rect.height/2+delta.y-next.height/2,guides:[]};}
  if(g.handle)return snapResizeRect(g.rect,g.handle,g.dx||0,g.dy||0,g.targets,8/g.scale,g.shift,g.project.heightLocked&&g.project.layout==='horizontal'?rect=>({...rect,x:g.rect.x}):undefined);
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},g.targets,8/g.scale)};
 }
 function dropTarget(g){
  const layer=document.elementFromPoint(g.lastX,g.lastY)?.closest('.stitch-layer');
  if(!layer||!canvas.current.contains(layer)||layer.dataset.imageId===g.id)return null;
  return g.layout.rects.find(rect=>rect.id===layer.dataset.imageId);
 }
 function end(event,cancelled=false){
  const g=gesture.current;if(!g||event.pointerId!==g.pointerId)return;
  if(!cancelled){g.lastX=event.clientX;g.lastY=event.clientY;g.dx=(event.clientX-g.startX)/g.scale;g.dy=(event.clientY-g.startY)/g.scale;g.shift=event.shiftKey;}
  return finish(cancelled);
 }
 function finish(cancelled){
  const g=gesture.current;if(!g)return;
  cancelAnimationFrame(frame.current);frame.current=null;gesture.current=null;setResizeDraft(null);if(g.handle)onResizePreview?.(null);
  const dragged=!cancelled&&Math.hypot(g.lastX-g.startX,g.lastY-g.startY)>=3;
  const target=dragged&&g.reorder?dropTarget(g):null;
  delete canvas.current.dataset.interacting;canvas.current.querySelector('.snap-guides').replaceChildren();
  canvas.current.querySelector('.reorder-indicator').hidden=true;
  if(g.reorder){
   canvas.current.style.removeProperty('--reorder-offset');
   if(target)return onReorder(g.id,target.id);
   return;
  }
  // React skips unchanged style properties. Restore every temporary gesture
  // value before committing, including axes the final layout keeps unchanged.
  if(!g.handle){showRect(g.element,g.rect);showRect(g.ghost,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);showControls(g.rect);}
  if(!dragged)return;
  const {x,y,width,height}=nextRect(g);
  return onChange({...g.project.positions,[g.id]:{x,y,width,height}},g.handle?'resize':'move');
 }
 function renderLayer(rect,ghost=false){
     const image=project.images.find(i=>i.id===rect.id);
     const imageStyle=rect.crop?{position:'absolute',maxWidth:'none',width:`${100/(1-rect.crop.left-rect.crop.right)}%`,height:`${100/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`,left:`${-100*rect.crop.left/(1-rect.crop.left-rect.crop.right)}%`,top:`${-100*(rect.crop.top||0)/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`}:undefined;
     const graded=!showOriginal&&hasImageColor(image.color);
     return <div data-image-id={!ghost?rect.id:undefined} data-ghost-image-id={ghost?rect.id:undefined} data-canvas-split={split?.id===rect.id?'':undefined} className={`${ghost?'stitch-ghost':'stitch-layer'} ${project.layout==='free'?'movable':'reorderable'} ${selected===rect.id?'selected':''}`} key={rect.id} style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${image.angle||0}deg)`}} tabIndex={ghost?undefined:0} role={ghost?undefined:'button'} aria-pressed={!ghost&&colorMode?selected===rect.id:undefined} aria-label={ghost?undefined:`${colorMode?'选中':'编辑'} ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>start(e,rect)} onClick={()=>onSelect(rect.id)} onContextMenu={event=>{event.preventDefault();if(!disabled&&!colorMode)onContext(rect.id,{x:event.clientX,y:event.clientY});}} onDoubleClick={event=>{if(!disabled&&!colorMode)editAt(event,rect.id);}} onKeyDown={event=>{
      if(disabled)return;
      if(event.key==='Enter'||colorMode&&event.key===' '){event.preventDefault();if(colorMode)onSelect(rect.id);else editAt(event,rect.id);return;}
      if(colorMode)return;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      if(event.altKey){const index=project.images.findIndex(image=>image.id===rect.id),target=project.images[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(target)onReorder(rect.id,target.id);return;}
      const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
     }}>
      {graded?<ColorLayer preview={image.preview} color={image.color} style={imageStyle}
       maxEdge={Math.min(1440,Math.floor(Math.sqrt(12000000/project.images.length)))}/>:<img src={image.preview} alt="" draggable={false} style={imageStyle}/>}
      {colorMode&&!ghost&&colorReference===rect.id&&<span className="color-reference-badge">参考</span>}
      {colorMode&&!ghost&&selected===rect.id&&<span className="color-selected-badge" aria-hidden="true"><Check size={13} weight="bold"/></span>}
     </div>;
 }
 return <div className="stitch-canvas-area" ref={area} tabIndex={-1} onPointerDown={event=>{
  if(disabled||event.button!==0||event.target.closest('.stitch-layer,.stitch-ghost,.stitch-selection,.inline-image-controls,.inline-image-tools,[data-canvas-split],.canvas-viewport-controls,.inline-image-editor'))return;
  onSelect?.(null);event.currentTarget.focus({preventScroll:true});
 }}>
  {layout?<div ref={canvas} className={`stitch-canvas ${preview?'has-output-preview':''}`} data-color-mode={colorMode||undefined} data-interacting={resizeDraft?'true':undefined} data-crop-gesture={cropGesture?'true':undefined} data-canvas-width={layout.width} data-canvas-height={layout.height} style={{...(!project.images.length&&emptyCanvasStyle(layout,scale,bounds)),width:layout.width*scale,height:layout.height*scale,transform:`translate(${offsetX}px,${offsetY}px)`}}>
   <div className="stitch-ghosts" aria-hidden>{layout.rects.filter(rect=>rect.id===selected).map(rect=>renderLayer(rect,true))}</div>
   <div className="stitch-content">
    {children}
    {preview&&<img className="stitch-output-preview" src={preview} alt="实际导出预览" draggable={false}/>}
    {layout.rects.map(rect=>renderLayer(rect))}
    <div className="reorder-indicator" hidden aria-hidden/>
    <div className="snap-guides" aria-hidden/>
   </div>
   <div className="stitch-canvas-edge" aria-hidden/>
   {selectedRect&&!colorMode&&!split&&!cropping&&!rotationOpen&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale,transform:`rotate(${selectedImage.angle||0}deg)`}}>
    {RESIZE_HANDLES.map(handle=><button key={handle} data-handle={handle} className={`resize-handle handle-${handle}`} aria-label={`缩放 ${selectedImage.name} ${handle}`} title="拖动缩放 · Shift 自由比例" disabled={disabled} onPointerDown={e=>start(e,selectedRect,handle)}/>)}
   </div>}
   {split&&selectedRect&&<CanvasSplitOverlay image={selectedImage} rect={selectedRect} scale={scale} value={split} onChange={onSplitChange} disabled={splitDisabled}/>}
   {selectedRect&&renderControls&&renderControls((()=>{
    const origin={left:bounds.left+(bounds.width-layout.width*scale)/2+offsetX,top:bounds.top+(bounds.height-layout.height*scale)/2+offsetY};
    return {origin,bounds,registerElements:registerControls,rect:selectedRect,scale,...imageControlsAt(selectedRect,origin)};
   })())}
  </div>:<div className="stitch-invalid">请调整画布</div>}
  {layout&&navigationHost&&createPortal(<ZoomControls navigation={navigation} disabled={navigationDisabled||cropGesture||!!resizeDraft} resetTitle="复位视图"/>,navigationHost)}
 </div>;
}
