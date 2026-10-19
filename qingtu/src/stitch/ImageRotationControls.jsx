import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {ArrowCounterClockwise,CaretUp,CaretDown} from '@phosphor-icons/react';
import {normalizeImageAngle} from '../../engine/image-rotation.mjs';

export const ImageRotationControls=forwardRef(function ImageRotationControls({image,disabled,onRotate,onPreview,onCommit,onGesture},ref){
 const value=normalizeImageAngle((image.rotation||0)+(image.angle||0)),[draft,setDraft]=useState(String(value)),[error,setError]=useState('');
 const latest=useRef(String(value)),dirty=useRef(false),revision=useRef(0),holding=useRef(false),frame=useRef(),pending=useRef(),callbacks=useRef(),drag=useRef(),rangeGesture=useRef(null),suppressedRange=useRef(null),rangeActions=useRef();callbacks.current={onPreview,onCommit,onGesture};
 useEffect(()=>{if(!dirty.current&&!pending.current){latest.current=String(value);setDraft(String(value));}},[value]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 function change(raw){revision.current++;latest.current=raw;dirty.current=true;setDraft(raw);setError('');if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=null;if(latest.current.trim()&&Number.isFinite(Number(latest.current)))callbacks.current.onPreview(Number(latest.current),revision.current);});}
 function flush(){
  if(rangeGesture.current!==null){const {id}=rangeGesture.current;rangeGesture.current=null;suppressedRange.current=id;callbacks.current.onGesture?.(false,id);}
  callbacks.current.onGesture?.(false);holding.current=false;drag.current=null;
  cancelAnimationFrame(frame.current);frame.current=null;if(!dirty.current)return pending.current||Promise.resolve();
  if(!latest.current.trim()||!Number.isFinite(Number(latest.current))){setError('请输入有效角度');return Promise.reject(new Error('请输入有效角度'));}
  const angle=normalizeImageAngle(Number(latest.current)),version=revision.current,previous=pending.current;dirty.current=false;
  const task=Promise.resolve(previous).catch(()=>{}).then(()=>callbacks.current.onCommit(angle,version)).then(()=>{if(revision.current===version){latest.current=String(angle);setDraft(String(angle));}}).catch(error=>{if(revision.current===version){dirty.current=true;setError(error.message);}throw error;}).finally(()=>{if(pending.current===task)pending.current=null;});pending.current=task;return task;
 }
 const finish=()=>{holding.current=false;callbacks.current.onGesture?.(false);flush().catch(()=>{});};
 function startRotation(){
  cancelAnimationFrame(frame.current);frame.current=null;revision.current++;holding.current=true;drag.current={before:latest.current,dirtyBefore:dirty.current};callbacks.current.onGesture?.(true);
  const angle=latest.current.trim()&&Number.isFinite(Number(latest.current))?normalizeImageAngle(Number(latest.current)):value;callbacks.current.onPreview(angle,revision.current);return angle;
 }
 function endRotation(cancelled,pointerId){
  const before=drag.current;if(!before)return Promise.resolve();drag.current=null;holding.current=false;callbacks.current.onGesture?.(false,pointerId);
  if(cancelled||!before.dirtyBefore&&Number(latest.current)===Number(before.before)){
   revision.current++;dirty.current=before.dirtyBefore;cancelAnimationFrame(frame.current);frame.current=null;latest.current=before.before;setDraft(before.before);callbacks.current.onPreview(before.dirtyBefore?Number(before.before):null,revision.current);return Promise.resolve();
  }
  return flush().catch(error=>{setError(error.message);});
 }
 function previewRange(x){
  const g=rangeGesture.current;if(!g)return;
  const fraction=Math.max(0,Math.min(1,(x-g.rect.left-8)/Math.max(1,g.rect.width-16)));
  change(String(Math.round((fraction*360-180)*10)/10));
 }
 function startRange(event){
  if(disabled||event.button!==0)return;event.preventDefault();suppressedRange.current=null;rangeGesture.current={id:event.pointerId,rect:event.currentTarget.getBoundingClientRect()};
  startRotation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);previewRange(event.clientX);
 }
 function endRange(event,cancelled=false){
  if(suppressedRange.current===event.pointerId){suppressedRange.current=null;return;}
  if(rangeGesture.current?.id!==event.pointerId)return;if(!cancelled)previewRange(event.clientX);rangeGesture.current=null;return endRotation(cancelled,event.pointerId);
 }
 rangeActions.current={endRange,move:event=>{if(rangeGesture.current?.id===event.pointerId&&event.buttons!==0)previewRange(event.clientX);},cancel:()=>{if(rangeGesture.current===null)return false;const {id}=rangeGesture.current;rangeGesture.current=null;suppressedRange.current=id;endRotation(true,id);return true;}};
 useEffect(()=>{
  const move=event=>rangeActions.current.move(event),end=event=>rangeActions.current.endRange(event,event.type==='pointercancel'),key=event=>{if(event.key==='Escape'&&rangeActions.current.cancel()){event.preventDefault();event.stopPropagation();}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);document.removeEventListener('keydown',key,true);};
 },[]);
 function stepAngle(delta){const current=latest.current.trim()&&Number.isFinite(Number(latest.current))?Number(latest.current):value;change(String(normalizeImageAngle(current+delta)));finish();}
 useImperativeHandle(ref,()=>({flush,startRotation,previewRotation:angle=>change(String(angle)),endRotation}));
 const numeric=Number(draft),angle=Number.isFinite(numeric)?normalizeImageAngle(numeric):value,rangeValue=Number.isFinite(numeric)&&numeric>=-180&&numeric<=180?numeric:angle;
 return <div className="precise-rotation-controls">
  <div className="inline-crop-value"><label htmlFor="rotation-degrees">角度</label><div className="number-with-unit rotation-number"><input id="rotation-degrees" aria-label="旋转角度" type="number" step="0.1" value={draft} disabled={disabled} onFocus={()=>onGesture?.(true)} onChange={e=>{onGesture?.(true);change(e.target.value);}} onBlur={()=>{if(!holding.current)finish();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();finish();}}}/><span>°</span><div className="rotation-stepper"><button aria-label="增加 0.1°" title="增加 0.1°" disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>stepAngle(.1)}><CaretUp size={10} weight="bold"/></button><button aria-label="减少 0.1°" title="减少 0.1°" disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>stepAngle(-.1)}><CaretDown size={10} weight="bold"/></button></div></div><button className="rotation-reset" aria-label="还原方向" title="还原方向" disabled={disabled||!angle} onClick={async()=>{try{await flush();if(image.rotation)await onRotate(-image.rotation);change('0');await flush();}catch(error){setError(error.message);}}}><ArrowCounterClockwise size={16}/></button></div>
  <input className="crop-amount-slider rotation-amount-slider" aria-label="旋转角度滑块" type="range" min="-180" max="180" step="0.1" value={rangeValue} style={{'--crop-progress':`${(rangeValue+180)/360*100}%`}} disabled={disabled} onPointerDown={startRange} onChange={event=>{if(suppressedRange.current!==null)return;onGesture?.(true);change(event.target.value);}} onKeyDown={event=>{if(suppressedRange.current!==null)event.preventDefault();}} onKeyUp={()=>{if(rangeGesture.current===null&&suppressedRange.current===null)finish();}} onBlur={()=>{if(!holding.current)finish();}}/>
  {error&&<p className="split-error" role="alert">{error}</p>}
 </div>;
});
