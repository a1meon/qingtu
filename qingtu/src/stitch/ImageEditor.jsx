import {forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useRef,useState} from 'react';
import {Crop,Scissors,Trash,FlipHorizontal,LinkSimple,LinkSimpleBreak,ArrowCounterClockwise,ArrowClockwise} from '@phosphor-icons/react';
import {createPortal} from 'react-dom';
import {cropEdges,changeCropEdge} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {ImageSplitControls} from './ImageSplitControls.jsx';
import {ImageRotationControls} from './ImageRotationControls.jsx';
import {CanvasRotationOverlay} from './CanvasRotationOverlay.jsx';
import {CanvasCropOverlay} from './CanvasCropOverlay.jsx';
import {placeImagePanel} from './canvas-viewport.js';
import {CROP_HANDLES} from '../../engine/crop-transform.mjs';

const empty={left:0,right:0,top:0,bottom:0};
const names={left:'左',right:'右',top:'上',bottom:'下'};
const pairs=[{axis:'horizontal',sides:['left','right'],name:'左右'},{axis:'vertical',sides:['top','bottom'],name:'上下'}];
export const ImageEditor=forwardRef(function ImageEditor({image,value,open,mode='crop',placement,hidden,onActivate,onPreview,onCommit,onSplit,splitDraft,onSplitDraft,onClose,onRemove,onRotate,onMirror,onAnglePreview,onAngleCommit,disabled},ref){
 const original=()=>({edges:cropEdges(image,value),links:{horizontal:value?.links?.horizontal??true,vertical:value?.links?.vertical??false}});
 const initial=()=>value==null?{edges:{...empty,left:Math.min(50,Math.floor((image.width-1)/2)),right:Math.min(50,Math.floor((image.width-1)/2))},links:{horizontal:true,vertical:false}}:original();
 const [panelOffset,setPanelOffset]=useState({x:0,y:0}),panelDrag=useRef(),panelMove=useRef(),panelRoot=useRef(),toolsRoot=useRef(),rotatingCorner=useRef(false),rotationEditor=useRef(),rotationGesture=useRef();
 const [side,setSide]=useState('left'),[draft,setDraft]=useState(initial),[error,setError]=useState('');
 const root=useRef(),latest=useRef(draft),touched=useRef(false),prefill=useRef(value==null),pointer=useRef(false),dragBefore=useRef(),cropClick=useRef(),timer=useRef(),frame=useRef(),callbacks=useRef(),flushRef=useRef(),closing=useRef(false),placementRef=useRef(placement);
 if(!pointer.current||rotatingCorner.current)placementRef.current=placement;
 useLayoutEffect(()=>{placement.registerElements?.({tools:toolsRoot.current,panel:panelRoot.current});return()=>placement.registerElements?.(null);},[placement.registerElements,open,mode,hidden]);
 const [panelHeight,setPanelHeight]=useState(0);
 useLayoutEffect(()=>{
  const panel=panelRoot.current;if(!panel||hidden)return;
  const measure=()=>setPanelHeight(panel.getBoundingClientRect().height);
  measure();const observer=new ResizeObserver(measure);observer.observe(panel);
  return()=>observer.disconnect();
 },[open,mode,hidden]);
 useLayoutEffect(()=>{setPanelOffset({x:0,y:0});},[image.id,mode,open]);
 const panelBase=placeImagePanel(placement.bounds,placementRef.current.panel,panelHeight);
 const panelStyle={...panelBase,
  left:Math.max(4,Math.min(panelBase.left+panelOffset.x,window.innerWidth-panelBase.width-4)),
  top:Math.max(4,Math.min(panelBase.top+panelOffset.y,window.innerHeight-panelHeight-4)),
 };
 function startPanelDrag(event){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
  panelDrag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:panelStyle.left,top:panelStyle.top,before:panelOffset};
 }
 function movePanel(event){const drag=panelDrag.current;if(!drag||drag.id!==event.pointerId)return;
  setPanelOffset({x:drag.left+event.clientX-drag.x-panelBase.left,y:drag.top+event.clientY-drag.y-panelBase.top});
 }
 panelMove.current=movePanel;
 useEffect(()=>{
  const move=e=>panelMove.current(e),finish=e=>{const drag=panelDrag.current;if(!drag||drag.id!==e.pointerId)return;if(e.type==='pointercancel')setPanelOffset(drag.before);panelDrag.current=null;cropClick.current=e.pointerId;};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);
  return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish,true);document.removeEventListener('pointercancel',finish,true);};
 },[]);
 callbacks.current={onPreview,onCommit,onClose};
 const axis=['left','right'].includes(side)?'horizontal':'vertical',linked=draft.links[axis],amount=draft.edges[side],opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[side];
 const size=axis==='horizontal'?image.width:image.height,max=linked?Math.floor((size-1)/2):size-1-draft.edges[opposite];
 function preview(next){touched.current=true;prefill.current=false;latest.current=next;setDraft(next);if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=null;callbacks.current.onPreview(latest.current,pointer.current?{gesture:true}:undefined);});}
 async function commit(){
  await rotationGesture.current?.flush();
  clearTimeout(timer.current);cancelAnimationFrame(frame.current);frame.current=null;
  if(!touched.current)callbacks.current.onPreview(null);
  else {touched.current=false;await callbacks.current.onCommit(latest.current);}
  await rotationEditor.current?.flush();
 }
 flushRef.current=commit;useImperativeHandle(ref,()=>({flush:()=>flushRef.current()}),[]);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>()=>{clearTimeout(timer.current);cancelAnimationFrame(frame.current);},[]);
 useEffect(()=>{closing.current=false;if(!open){const next=initial();latest.current=next;setDraft(next);touched.current=false;prefill.current=value==null;}},[open,value]);
 useEffect(()=>{const next=initial();latest.current=next;setDraft(next);touched.current=false;prefill.current=value==null;},[image.rotation]);
 function close(){if(closing.current)return;closing.current=true;commit().then(()=>callbacks.current.onClose()).catch(e=>{closing.current=false;setError(e.message);});}
 useEffect(()=>{
  if(!open||hidden||disabled)return;
  const dismiss=e=>{
   if(e.target.closest('.canvas-viewport-controls'))return;
   if(e.type==='pointerdown')cropClick.current=undefined;
   // Releasing an edge after cancellation can synthesize a click on the
   // picture below it. Consume only that pointer's trailing click.
   if(e.type==='click'&&cropClick.current!==undefined){const id=cropClick.current;cropClick.current=undefined;if(e.pointerId===id){e.preventDefault();e.stopPropagation();return;}}
   if(!root.current?.contains(e.target)&&!toolsRoot.current?.contains(e.target)&&!panelRoot.current?.contains(e.target)&&!e.target.closest('[data-canvas-split],.canvas-rotation-target')&&!pointer.current)close();
  };
  document.addEventListener('pointerdown',dismiss,true);document.addEventListener('click',dismiss,true);return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('click',dismiss,true);};
 },[open,hidden,disabled]);
 async function activate(next){
  try{await commit();if(open&&mode===next){onClose();return;}onActivate(next);onSplitDraft(next==='split'?{axis:image.width>=2?'x':'y',at:Math.floor((image.width>=2?image.width:image.height)/2)}:null);}
  catch(e){setError(e.message);}
 }
 function chooseSide(next){
  if(prefill.current&&axis!==(['left','right'].includes(next)?'horizontal':'vertical')){const clean={edges:{...empty},links:{...latest.current.links}};latest.current=clean;setDraft(clean);prefill.current=false;}
  setSide(next);
 }
 function change(raw){const current=prefill.current&&axis==='vertical'?{...latest.current,edges:{...empty}}:latest.current;preview({...current,edges:changeCropEdge(image,current.edges,side,raw,current.links[axis])});clearTimeout(timer.current);if(!pointer.current)timer.current=setTimeout(()=>commit().catch(e=>setError(e.message)),450);}
 function finish(){pointer.current=false;commit().catch(e=>setError(e.message));}
 function startCrop(edge){
  clearTimeout(timer.current);cancelAnimationFrame(frame.current);frame.current=null;
  dragBefore.current={draft:latest.current,touched:touched.current,prefill:prefill.current,side};pointer.current=true;setSide(CROP_HANDLES[edge].find(candidate=>['left','right'].includes(candidate)===(axis==='horizontal'))||CROP_HANDLES[edge][0]);
  callbacks.current.onPreview(prefill.current?original():latest.current,{gesture:true});
 }
 function previewCrop(edit){touched.current=true;prefill.current=false;latest.current=edit;setDraft(edit);callbacks.current.onPreview(edit,{gesture:true});}
 function endCrop(cancelled,pointerId){
  pointer.current=false;cropClick.current=pointerId;
  if(cancelled){const before=dragBefore.current;latest.current=before.draft;touched.current=before.touched;prefill.current=before.prefill;setDraft(before.draft);setSide(before.side);callbacks.current.onPreview(before.touched?before.draft:null);if(before.touched)timer.current=setTimeout(()=>commit().catch(e=>setError(e.message)),450);return Promise.resolve();}
  return commit().catch(e=>setError(e.message));
 }
 function link(pairAxis){
  const current=prefill.current?{...latest.current,edges:{...empty}}:latest.current,enabled=!current.links[pairAxis],edge=pairAxis===axis?side:pairAxis==='horizontal'?'left':'top';
  setSide(edge);preview({...current,links:{...current.links,[pairAxis]:enabled},edges:enabled?changeCropEdge(image,current.edges,edge,current.edges[edge],true):current.edges});commit().catch(e=>setError(e.message));
 }
 function edgeButton(edge,pairAxis){
  const active=pairAxis===axis&&(draft.links[pairAxis]||side===edge);
  return <button aria-label={`裁剪${names[edge]}边`} aria-pressed={active} className={active?'active':''} disabled={disabled} onClick={()=>chooseSide(edge)}>{names[edge]}</button>;
 }
 return <div ref={root} className="inline-image-controls" hidden={hidden} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
  {open&&mode==='crop'&&<CanvasCropOverlay image={image} rect={placement.rect} scale={placement.scale} value={prefill.current?original():draft} disabled={disabled} onStart={startCrop} onPreview={previewCrop} onEnd={endCrop}/>}
  {open&&mode==='rotate'&&<CanvasRotationOverlay ref={rotationGesture} hidden={hidden} origin={placement.origin} image={image} rect={placement.rect} scale={placement.scale} disabled={disabled} onStart={()=>{rotatingCorner.current=true;return rotationEditor.current.startRotation();}} onPreview={angle=>rotationEditor.current.previewRotation(angle)} onEnd={(cancelled,id)=>{rotatingCorner.current=false;return rotationEditor.current.endRotation(cancelled,id);}}/>}
  {createPortal(<div hidden={hidden} ref={toolsRoot} className="inline-image-tools editor-mode image-tools-portal" role="group" aria-label="图片操作" style={placement.tools}>
   <button aria-label="裁剪" title="裁剪" className={open&&mode==='crop'?'active':''} aria-pressed={open&&mode==='crop'} disabled={disabled} onClick={()=>activate('crop')}><Crop size={17} aria-hidden/></button>
   <button aria-label="分割" title="分割" className={open&&mode==='split'?'active':''} aria-pressed={open&&mode==='split'} disabled={disabled||image.width<2&&image.height<2} onClick={()=>activate('split')}><Scissors size={17} aria-hidden/></button>
   <button aria-label="旋转" title="旋转" className={open&&mode==='rotate'?'active':''} aria-pressed={open&&mode==='rotate'} disabled={disabled} onClick={()=>activate('rotate')}><ArrowClockwise size={17} aria-hidden/></button>
   <button aria-label="水平镜像" title="水平镜像" className={image.mirrored?'active':''} aria-pressed={!!image.mirrored} disabled={disabled} onClick={onMirror}><FlipHorizontal size={17} aria-hidden/></button>
   <button className="image-delete" aria-label="删除图片" title="删除图片" disabled={disabled} onClick={onRemove}><Trash size={17} aria-hidden/></button>
  </div>,document.body)}
  {open&&createPortal(<section hidden={hidden} ref={panelRoot} className="image-editor inline-image-editor image-editor-portal" aria-label={mode==='rotate'?'旋转设置':mode==='split'?'分割设置':'裁剪设置'} style={panelStyle}>
   <button className="image-panel-grip" aria-label="移动操作面板" title="拖动操作面板" onPointerDown={startPanelDrag} onKeyDown={event=>{
    const step=event.shiftKey?32:8,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
    if(delta){event.preventDefault();event.stopPropagation();setPanelOffset({x:panelStyle.left+delta[0]-panelBase.left,y:panelStyle.top+delta[1]-panelBase.top});}
   }}><span aria-hidden/></button>
   {mode==='rotate'?<ImageRotationControls ref={rotationEditor} image={image} disabled={disabled} onRotate={onRotate} onPreview={onAnglePreview} onCommit={onAngleCommit} onGesture={(active,pointerId)=>{pointer.current=active;if(pointerId!==undefined)cropClick.current=pointerId;}}/>:mode==='split'&&splitDraft?<ImageSplitControls image={image} value={splitDraft} onChange={onSplitDraft} disabled={disabled} onConfirm={onSplit} onCancel={close}/>:<>
    <div className="crop-edge-options" role="group" aria-label="裁剪边">{pairs.map(pair=><div key={pair.axis} className="crop-edge-pair" role="group" aria-label={`${pair.name}裁剪`}>
     {edgeButton(pair.sides[0],pair.axis)}
     <button className={`crop-link ${axis===pair.axis&&draft.links[pair.axis]?'active':''}`} aria-label={`关联${pair.name}裁剪`} aria-pressed={draft.links[pair.axis]} title={`${draft.links[pair.axis]?'取消':'开启'}${pair.name}联动`} disabled={disabled} onClick={()=>link(pair.axis)}>{draft.links[pair.axis]?<LinkSimple size={16}/>:<LinkSimpleBreak size={16}/>}</button>
     {edgeButton(pair.sides[1],pair.axis)}
    </div>)}
     <button className="crop-reset" aria-label="重置此图裁剪" title="重置此图裁剪" disabled={disabled} onClick={()=>{preview({...latest.current,edges:{...empty}});commit().catch(e=>setError(e.message));}}><ArrowCounterClockwise size={17}/></button>
    </div>
    <input className="crop-amount-slider" aria-label="裁剪量滑块" type="range" min="0" max={max} step="1" value={amount} style={{'--crop-progress':`${max?100*amount/max:0}%`}} disabled={disabled} onPointerDown={()=>{clearTimeout(timer.current);pointer.current=true;}} onChange={event=>change(event.target.value)} onPointerUp={finish} onPointerCancel={finish} onKeyUp={finish} onBlur={finish}/>
    <div className="inline-crop-value"><label htmlFor="crop-amount">{linked?(axis==='horizontal'?'左右各裁':'上下各裁'):`${names[side]}方裁剪`}</label><div className="number-with-unit"><input id="crop-amount" aria-label="裁剪像素" type="number" min="0" max={max} step="1" value={amount} disabled={disabled} onFocus={event=>event.target.select()} onChange={event=>change(event.target.value)} onBlur={()=>{if(!pointer.current)finish();}} onKeyDown={event=>{if(event.key==='Enter')finish();}}/><span>px</span></div></div>
   </>}
   {error&&<p className="split-error" role="alert">{error}</p>}
  </section>,document.body)}
 </div>;
});
