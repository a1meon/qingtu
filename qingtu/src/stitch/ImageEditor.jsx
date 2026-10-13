import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowCounterClockwise} from '@phosphor-icons/react';
import {cropLimit} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {editorPosition} from './editor-position.js';

export const ImageEditor=forwardRef(function ImageEditor({image,value,anchor,hidden,onPreview,onCommit,onClose,disabled},ref){
 const original={axis:value?.axis||'horizontal',amount:value?.amount||0},initial=value==null?{axis:'horizontal',amount:Math.min(50,cropLimit(image,'horizontal'))}:original;
 const [draft,setDraft]=useState(initial),latest=useRef(initial),committed=useRef(original),touched=useRef(false),pointer=useRef(false),timer=useRef(),frame=useRef(),callbacks=useRef(),flushRef=useRef(),panel=useRef();
 const [position,setPosition]=useState({left:anchor?.x||8,top:anchor?.y||8});
 const positionRef=useRef(position),drag=useRef(),dragFrame=useRef(),mounted=useRef(true),closing=useRef(false),skipDragClick=useRef(false);
 useLayoutEffect(()=>{
  if(hidden)return;const size=panel.current.getBoundingClientRect();
  const next=editorPosition(anchor||{x:(innerWidth-size.width)/2,y:(innerHeight-size.height)/2},size,{width:innerWidth,height:innerHeight});positionRef.current=next;setPosition(next);
  const place=()=>{const size=panel.current.getBoundingClientRect(),next=editorPosition({x:positionRef.current.left,y:positionRef.current.top},size,{width:innerWidth,height:innerHeight});positionRef.current=next;setPosition(next);};
  window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);
 },[anchor?.x,anchor?.y,hidden]);
 callbacks.current={onPreview,onCommit,onClose};
 function preview(next){touched.current=true;latest.current=next;setDraft(next);if(frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=null;callbacks.current.onPreview(latest.current);});}
 function commit(force=false){
  clearTimeout(timer.current);cancelAnimationFrame(frame.current);frame.current=null;
  if(!force&&!touched.current){callbacks.current.onPreview(null);return Promise.resolve();}
  const next={axis:latest.current.axis,amount:Number(latest.current.amount)||0};
  latest.current=next;setDraft(next);
  if(next.axis===committed.current.axis&&next.amount===committed.current.amount){callbacks.current.onPreview(null);return Promise.resolve();}
  committed.current=next;touched.current=false;return Promise.resolve(callbacks.current.onCommit(next));
 }
 flushRef.current=commit;
 useImperativeHandle(ref,()=>({flush:()=>flushRef.current()}),[]);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);cancelAnimationFrame(frame.current);cancelAnimationFrame(dragFrame.current);};},[]);
 useEffect(()=>{
  if(hidden||disabled)return;
  const dismiss=event=>{if(event.type==='pointerdown'&&!drag.current)skipDragClick.current=false;if(event.type==='click'&&skipDragClick.current){skipDragClick.current=false;if(event.detail>0){event.preventDefault();event.stopPropagation();return;}}if(!panel.current.contains(event.target)&&!drag.current&&!pointer.current)close();};
  document.addEventListener('pointerdown',dismiss,true);document.addEventListener('click',dismiss,true);
  document.addEventListener('pointermove',moveDrag,true);document.addEventListener('pointerup',endDrag,true);document.addEventListener('pointercancel',endDrag,true);
  return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('click',dismiss,true);document.removeEventListener('pointermove',moveDrag,true);document.removeEventListener('pointerup',endDrag,true);document.removeEventListener('pointercancel',endDrag,true);};
 },[hidden,disabled]);
 function amount(raw){
  const number=raw===''?'':Math.max(0,Math.min(cropLimit(image,latest.current.axis),Math.round(Number(raw)||0)));
  preview({...latest.current,amount:number});clearTimeout(timer.current);if(!pointer.current)timer.current=setTimeout(()=>commit().catch(()=>{}),450);
 }
 function direction(axis){if(axis===latest.current.axis)return;preview({axis,amount:0});commit().catch(()=>{});}
 function finish(){pointer.current=false;commit().catch(()=>{});}
 function close(force=false){if(closing.current)return;closing.current=true;commit(force).then(()=>{if(mounted.current)callbacks.current.onClose();}).catch(()=>{closing.current=false;});}
 function startDrag(event){
  if(disabled||event.button!==0||event.target.closest('button'))return;
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,...positionRef.current,size:panel.current.getBoundingClientRect()};
  panel.current.dataset.dragging='true';
 }
 function moveDrag(event){
  const current=drag.current;if(!current||event.pointerId!==current.id)return;
  if(Math.hypot(event.clientX-current.x,event.clientY-current.y)>3)current.moved=true;
  positionRef.current=editorPosition({x:current.left+event.clientX-current.x,y:current.top+event.clientY-current.y},current.size,{width:innerWidth,height:innerHeight});
  if(dragFrame.current)return;dragFrame.current=requestAnimationFrame(()=>{dragFrame.current=null;if(panel.current)Object.assign(panel.current.style,{left:positionRef.current.left+'px',top:positionRef.current.top+'px'});});
 }
 function endDrag(event){if(!drag.current||event.pointerId!==drag.current.id)return;if(event.type!=='pointercancel')moveDrag(event);skipDragClick.current=!!drag.current.moved;cancelAnimationFrame(dragFrame.current);dragFrame.current=null;drag.current=null;delete panel.current.dataset.dragging;setPosition({...positionRef.current});}
 return createPortal(<section ref={panel} hidden={hidden} style={position} className="image-editor" role="dialog" aria-label="单图编辑" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
  <div className="image-editor-heading" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span title={image.name}>{image.name}</span><button className="image-editor-close" aria-label="关闭单图编辑" onClick={()=>close()}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button></div>
  <div className="crop-direction" role="group" aria-label="裁剪方向">{[['horizontal','左右'],['vertical','上下']].map(([axis,label])=><button key={axis} disabled={disabled} aria-pressed={draft.axis===axis} className={draft.axis===axis?'active':''} onClick={()=>direction(axis)}>{label}</button>)}</div>
  <label htmlFor="crop-amount">每侧裁剪</label>
  <input className="crop-slider" aria-label="每侧裁剪滑块" style={{'--crop-progress':`${100*(Number(draft.amount)||0)/Math.max(1,cropLimit(image,draft.axis))}%`}} type="range" min="0" max={cropLimit(image,draft.axis)} step="1" value={draft.amount||0} disabled={disabled} onPointerDown={event=>{pointer.current=true;clearTimeout(timer.current);try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}}} onChange={event=>amount(event.target.value)} onPointerUp={finish} onPointerCancel={finish} onKeyUp={finish} onBlur={finish}/>
  <div className="number-with-unit"><input id="crop-amount" aria-label="每侧裁剪像素" autoFocus type="number" min="0" max={cropLimit(image,draft.axis)} step="1" value={draft.amount} disabled={disabled} onFocus={event=>event.target.select()} onChange={event=>amount(event.target.value)} onBlur={()=>{if(!pointer.current)finish();}} onKeyDown={event=>{if(event.key==='Enter')finish();}}/><span>px</span></div>
  <div className="image-editor-actions"><button className="crop-reset" disabled={disabled} onClick={()=>{preview({...latest.current,amount:0});commit().catch(()=>{});}}><ArrowCounterClockwise size={16}/>重置</button><button className="crop-done" disabled={disabled} onClick={()=>close(true)}>完成</button></div>
 </section>,document.body);
});
