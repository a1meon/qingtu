import {extendLiquifyPath,portraitForCrop} from '../../engine/portrait-retouch.mjs';
import {sampleCanvasPixel,layerPoint} from './canvas-pick.js';
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
import {ComparisonDivider} from '../ComparisonDivider.jsx';
import {applyCanvasCamera,canvasPanContent,placeImageControls,fitCanvasViewport,resizeCanvasViewport} from './canvas-viewport.js';

import {useCanvasNavigation} from './useCanvasNavigation.js';
import {hasImageColor} from '../../engine/image-color.mjs';
import {ColorLayer} from './ColorLayer.jsx';

function emptyCanvasStyle(layout,scale,bounds){
 const width=Math.min(layout.width*scale,bounds.width),height=Math.min(layout.height*scale,bounds.height);
 return {'--empty-width':'232px','--empty-height':'218px','--empty-scale':.9*Math.min(width/232,height/218)};
}

export function StitchCanvas({project:sourceProject,layout:sourceLayout,onChange,onResizePreview,onEdit,onContext,onReorder,selected,onSelect,disabled,navigationTarget,navigationDisabled=disabled,preview,children,viewportMode,viewRevision=0,split,onSplitChange,splitDisabled,cropping,rotationOpen,cropGesture,renderControls,colorMode,colorView,colorDraft,colorReference,colorPicker,portraitBrush}){
 const area=useRef(),canvas=useRef(),viewportSizing=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),moveRef=useRef(),endRef=useRef(),cropView=useRef(),[bounds,setBounds]=useState({width:600,height:360,left:0,top:0,windowHeight:window.innerHeight}),[resizeDraft,setResizeDraft]=useState(null),[navigationHost,setNavigationHost]=useState(null);
 const comparePosition=useRef(50),comparing=colorMode&&colorView==='compare';
 useLayoutEffect(()=>{const host=navigationTarget?.current||null;if(host!==navigationHost)setNavigationHost(host);});
 const brushGesture=useRef(null),brushFrame=useRef(null),loupe=useRef(null),loupeFrame=useRef(null),loupeSample=useRef(null);
 const controlNodes=useRef(),registerControls=useCallback(nodes=>{controlNodes.current=nodes;},[]);
 const project=resizeDraft||sourceProject,layout=useMemo(()=>resizeDraft?calculateLayout(resizeDraft,{draft:true}):sourceLayout,[resizeDraft,sourceLayout]);
 const layerImages=useMemo(()=>new Map(project.images.map(image=>[image.id,image])),[project.images]);
 flushRef.current=(cancelled=false)=>finish(cancelled);moveRef.current=move;endRef.current=end;
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 const hasImages=sourceProject.images.length>0;
 useLayoutEffect(()=>{
  const windowTitle=area.current.closest('.app')?.querySelector('.titlebar');
  const header=area.current.closest('.preview-workspace')?.querySelector('.stitch-file-toolbar');
  const measure=()=>{
   const rect=area.current.getBoundingClientRect(),headerTop=header?.getBoundingClientRect().top;
   const windowTitleBottom=windowTitle?.getBoundingClientRect().bottom??0;
   if(rect.width&&rect.height)setBounds({width:rect.width,height:rect.height,left:rect.left,top:rect.top,
    toolbarFloor:headerTop===undefined?undefined:Math.max(headerTop,windowTitleBottom,0)+5,
    windowHeight:window.innerHeight,navigation:navigationHost?.getBoundingClientRect()});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(area.current);
  for(const node of [navigationHost,windowTitle,header])if(node)observer.observe(node);
  window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);};
 },[navigationHost,hasImages,colorMode,colorView]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);cancelAnimationFrame(loupeFrame.current);cancelAnimationFrame(brushFrame.current);},[]);
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
 const showGhost=!comparing&&(!colorMode||selectionBounds&&(selectionBounds.x<0||selectionBounds.y<0||selectionBounds.x+selectionBounds.width>layout.width||selectionBounds.y+selectionBounds.height>layout.height));
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
 useEffect(()=>{
  if(portraitBrush)return;
  cancelAnimationFrame(brushFrame.current);brushFrame.current=null;brushGesture.current=null;
 },[!!portraitBrush]);
 function sampledLayer(element,rect,clientX){
  const box=canvas.current.getBoundingClientRect();
  const original=comparing&&(clientX-box.left)*100<box.width*comparePosition.current;
  return original?canvas.current.querySelector(`[data-original-id="${CSS.escape(rect.id)}"]`):element;
 }
 function pickAtPointer(event,rect,image){
  if(!colorPicker||!loupe.current||disabled||event.button!==0)return;
  const {clientX,clientY,currentTarget}=event;
  const layer=sampledLayer(currentTarget,rect,clientX),angle=image.angle||0;
  const shown=loupeSample.current;
  const pixel=shown?.layer===layer&&Math.abs(shown.clientX-clientX)<.6&&Math.abs(shown.clientY-clientY)<.6
   ? shown.pixel
   : sampleCanvasPixel(layer,layerPoint(event,canvas.current,rect,scale,angle));
  onSelect(rect.id);colorPicker(rect.id,pixel);
 }
 function hideLoupe(){
  cancelAnimationFrame(loupeFrame.current);
  loupeSample.current=null;
  if(loupe.current)loupe.current.hidden=true;
 }
 function moveLoupe(event,rect,image){
  if(!colorPicker||!loupe.current||disabled)return;
  const {clientX,clientY,currentTarget}=event;
  cancelAnimationFrame(loupeFrame.current);
  loupeFrame.current=requestAnimationFrame(()=>{
   if(!loupe.current||!canvas.current)return;
   const angle=image.angle||0,position=layerPoint({clientX,clientY},canvas.current,rect,scale,angle);
   const layer=sampledLayer(currentTarget,rect,clientX);
   const pixel=sampleCanvasPixel(layer,position);
   if(!pixel){hideLoupe();return;}
   loupeSample.current={pixel,layer,clientX,clientY};
   loupe.current.style.setProperty('--loupe-color',`rgb(${pixel[0]} ${pixel[1]} ${pixel[2]})`);
   loupe.current.style.left=clientX+'px';
   loupe.current.style.top=clientY+'px';
   loupe.current.hidden=false;
  });
 }
 function brushStart(event,rect,image){
  if(!portraitBrush||rect.id!==selected||disabled||event.button!==0){start(event,rect);return;}
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  const last=layerPoint(event,canvas.current,rect,scale,image.angle||0);
  const {left=0,right=0,top=0,bottom=0}=rect.crop||{};
  const bound=value=>Math.min(.4,Math.max(.0007,value));
  const radius=bound(portraitBrush.size*(1-left-right)/(rect.width*scale*2));
  const radiusY=bound(portraitBrush.size*(1-top-bottom)/(rect.height*scale*2));
  brushGesture.current={id:event.pointerId,layer:rect.id,last,path:[],radius,radiusY};
 }
 function brushMove(event,rect,image,done=false,cancelled=false){
  const ring=event.currentTarget.querySelector('.liquify-cursor');
  const point=ring&&!cancelled?layerPoint(event,canvas.current,rect,scale,image.angle||0):null;
  if(point){
   const {left=0,right=0,top=0,bottom=0}=rect.crop||{};
   ring.style.left=`${(point.x-left)/(1-left-right)*100}%`;
   ring.style.top=`${(point.y-top)/(1-top-bottom)*100}%`;
   ring.hidden=false;
  }
  const drag=brushGesture.current;
  if(!drag||drag.id!==event.pointerId||drag.layer!==rect.id)return;
  if(cancelled||!portraitBrush){cancelAnimationFrame(brushFrame.current);brushFrame.current=null;brushGesture.current=null;portraitBrush?.cancel();return;}
  const before=drag.path.length;
  const {path,last,radius,radiusY}=drag;
  const next=point||layerPoint(event,canvas.current,rect,scale,image.angle||0);
  drag.last=extendLiquifyPath(path,last,next,radius,radiusY,'push',done);
  if(done){
   cancelAnimationFrame(brushFrame.current);brushFrame.current=null;
   if(path.length)portraitBrush.update(path);
   brushGesture.current=null;portraitBrush.commit();
   return;
  }
  if(path.length!==before&&!brushFrame.current)brushFrame.current=requestAnimationFrame(()=>{
   brushFrame.current=null;
   if(brushGesture.current===drag)portraitBrush.update(path);
  });
 }
 function renderLayer(rect,ghost=false,comparisonOriginal=false){
     const image=layerImages.get(rect.id);
     const imageStyle=rect.crop?{position:'absolute',maxWidth:'none',width:`${100/(1-rect.crop.left-rect.crop.right)}%`,height:`${100/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`,left:`${-100*rect.crop.left/(1-rect.crop.left-rect.crop.right)}%`,top:`${-100*(rect.crop.top||0)/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`}:undefined;
     const geometry={left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale,transform:`rotate(${image.angle||0}deg)`};
     const badges=colorMode&&!ghost&&colorReference===rect.id&&<span className="color-reference-badge">参考</span>;
     if(comparisonOriginal)return <div data-original-id={rect.id} className="stitch-layer" key={rect.id} style={geometry}><img src={image.preview} alt="" draggable={false} style={imageStyle}/>{badges}</div>;
     const interactive=colorDraft?.projectId===project.id&&colorDraft.id===image.id;
     const grade=interactive?colorDraft.color:image.color;
     const color=grade?.retouch?.length?{...grade,retouch:portraitForCrop(grade.retouch,rect.crop)}:grade;
     const graded=!(colorMode&&colorView==='original')&&hasImageColor(color);
     const brush=!ghost&&selected===rect.id?portraitBrush:null;
     const brushStyle=brush?{width:brush.size,height:brush.size}:undefined;
     return <div data-image-id={!ghost?rect.id:undefined} data-ghost-image-id={ghost?rect.id:undefined} data-canvas-split={split?.id===rect.id?'':undefined} className={`${ghost?'stitch-ghost':'stitch-layer'} ${project.layout==='free'?'movable':'reorderable'} ${selected===rect.id?'selected':''}`} key={rect.id} style={geometry} tabIndex={ghost?undefined:0} role={ghost?undefined:'button'} aria-pressed={!ghost&&colorMode?selected===rect.id:undefined} aria-label={ghost?undefined:`${colorMode?'选中':'编辑'} ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>brushStart(e,rect,image)} onPointerMove={e=>{brushMove(e,rect,image);moveLoupe(e,rect,image);}} onPointerEnter={e=>moveLoupe(e,rect,image)} onPointerLeave={e=>{hideLoupe();const ring=e.currentTarget.querySelector('.liquify-cursor');if(ring)ring.hidden=true;}} onPointerUp={e=>{brushMove(e,rect,image,true);pickAtPointer(e,rect,image);}} onPointerCancel={e=>brushMove(e,rect,image,false,true)} onLostPointerCapture={e=>brushMove(e,rect,image,false,true)} onClick={()=>onSelect(rect.id)} onContextMenu={event=>{event.preventDefault();if(!disabled)onContext(rect.id,{x:event.clientX,y:event.clientY});}} onDoubleClick={event=>{if(!disabled&&!portraitBrush&&!colorPicker)editAt(event,rect.id);}} onKeyDown={event=>{
      if(disabled)return;
      if(event.key==='Enter'||colorMode&&event.key===' '){event.preventDefault();if(colorMode)onSelect(rect.id);else editAt(event,rect.id);return;}
      if(colorMode)return;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();
      if(event.altKey){const index=project.images.findIndex(image=>image.id===rect.id),target=project.images[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(target)onReorder(rect.id,target.id);return;}
      const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
     }}>
      {graded?<ColorLayer preview={image.preview} color={color} style={imageStyle} interactive={interactive?(colorDraft.kind||true):false}/>:<img src={image.preview} alt="" draggable={false} style={imageStyle}/>}
      {badges}
      {brush&&<span className="liquify-cursor" style={brushStyle} aria-hidden="true" hidden/>}
     </div>;
 }
 return <div className="stitch-canvas-area" ref={area} tabIndex={-1} onPointerDown={event=>{
  if(disabled||event.button!==0||event.target.closest('.stitch-layer,.stitch-ghost,.stitch-selection,.inline-image-controls,.inline-image-tools,[data-canvas-split],.canvas-viewport-controls,.inline-image-editor,.stitch-compare-drag,.compare-slider'))return;
  event.currentTarget.focus({preventScroll:true});
 }}>
  {layout?<div ref={canvas} className={`stitch-canvas ${preview?'has-output-preview':''}`} data-color-mode={colorMode||undefined} data-color-picker={!!colorPicker||undefined} data-portrait-brush={!!portraitBrush||undefined} data-color-compare={comparing||undefined} data-interacting={resizeDraft?'true':undefined} data-crop-gesture={cropGesture?'true':undefined} data-canvas-width={layout.width} data-canvas-height={layout.height} style={{...(!project.images.length&&emptyCanvasStyle(layout,scale,bounds)),...(comparing&&{'--split':`${comparePosition.current}%`,'--compare-glow':comparePosition.current<100?1:0}),width:layout.width*scale,height:layout.height*scale,transform:`translate(${offsetX}px,${offsetY}px)`}}>
   <div className="stitch-ghosts" aria-hidden>{showGhost&&selectedRect&&renderLayer(selectedRect,true)}</div>
   <div className="stitch-content">
    {children}
    {preview&&<img className="stitch-output-preview" src={preview} alt="实际导出预览" draggable={false}/>}
    {layout.rects.map(rect=>renderLayer(rect))}
    <div className="reorder-indicator" hidden aria-hidden/>
    <div className="snap-guides" aria-hidden/>
   </div>
   {comparing&&<>
    <div className="stitch-compare-original" aria-hidden="true">{layout.rects.map(rect=>renderLayer(rect,false,true))}</div>
    <div className="stitch-compare-glow" aria-hidden="true">
     <span className="comparison-light comparison-light-top"/>
     <span className="comparison-light comparison-light-right"/>
     <span className="comparison-light comparison-light-bottom"/>
    </div>
    <span className="image-label original-label stitch-compare-label" aria-hidden="true">原图</span>
    <span className="image-label processed-label stitch-compare-label" aria-hidden="true">处理后</span>
    <ComparisonDivider container={canvas} position={comparePosition} dragClassName="stitch-compare-drag" label="调色前后对比" onChange={()=>canvas.current?.style.setProperty('--compare-glow',comparePosition.current<100?'1':'0')}/>
   </>}
   {!comparing&&<div className="stitch-canvas-edge" aria-hidden/>}
   {selectedRect&&!split&&!cropping&&!rotationOpen&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale,transform:`rotate(${selectedImage.angle||0}deg)`}}>
    {!colorMode&&RESIZE_HANDLES.map(handle=><button key={handle} data-handle={handle} className={`resize-handle handle-${handle}`} aria-label={`缩放 ${selectedImage.name} ${handle}`} title="拖动缩放 · Shift 自由比例" disabled={disabled} onPointerDown={e=>start(e,selectedRect,handle)}/>)}
   </div>}
   {split&&selectedRect&&<CanvasSplitOverlay image={selectedImage} rect={selectedRect} scale={scale} value={split} onChange={onSplitChange} disabled={splitDisabled}/>}
   {selectedRect&&renderControls&&renderControls((()=>{
    const origin={left:bounds.left+(bounds.width-layout.width*scale)/2+offsetX,top:bounds.top+(bounds.height-layout.height*scale)/2+offsetY};
    return {origin,bounds,registerElements:registerControls,rect:selectedRect,scale,...imageControlsAt(selectedRect,origin)};
   })())}
  </div>:<div className="stitch-invalid">请调整画布</div>}
  {colorPicker&&createPortal(<div className="hsl-loupe" aria-hidden="true" hidden ref={loupe}>
    <span className="hsl-loupe-window"/><span className="hsl-loupe-center"/>
    <span className="hsl-loupe-hint">点击选取颜色</span>
  </div>,document.body)}
  {layout&&navigationHost&&createPortal(<ZoomControls navigation={navigation} disabled={navigationDisabled||cropGesture||!!resizeDraft} resetTitle="复位视图"/>,navigationHost)}
 </div>;
}
