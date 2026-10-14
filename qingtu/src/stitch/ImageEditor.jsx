import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Crop,Scissors,LinkSimple,LinkSimpleBreak,ArrowCounterClockwise} from '@phosphor-icons/react';
import {cropEdges,changeCropEdge} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {ImageSplitControls} from './ImageSplitControls.jsx';

const empty={left:0,right:0,top:0,bottom:0};
const names={left:'左',right:'右',top:'上',bottom:'下'};
export const ImageEditor=forwardRef(function ImageEditor({image,value,open,placement,hidden,onActivate,onPreview,onCommit,onSplit,splitDraft,onSplitDraft,onClose,disabled},ref){
 const original=()=>({edges:cropEdges(image,value),links:{horizontal:value?.links?.horizontal??true,vertical:value?.links?.vertical??true}});
 const initial=()=>value==null?{edges:{...empty,left:Math.min(50,Math.floor((image.width-1)/2)),right:Math.min(50,Math.floor((image.width-1)/2))},links:{horizontal:true,vertical:true}}:original();
 const [mode,setMode]=useState('crop'),[side,setSide]=useState('left'),[draft,setDraft]=useState(initial),[error,setError]=useState('');
 const root=useRef(),latest=useRef(draft),touched=useRef(false),prefill=useRef(value==null),pointer=useRef(false),timer=useRef(),frame=useRef(),callbacks=useRef(),flushRef=useRef(),closing=useRef(false),placementRef=useRef(placement);
 if(!pointer.current)placementRef.current=placement;
 callbacks.current={onPreview,onCommit,onClose};
 const axis=['left','right'].includes(side)?'horizontal':'vertical',linked=draft.links[axis],amount=draft.edges[side],opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[side];
 const size=axis==='horizontal'?image.width:image.height,max=linked?Math.floor((size-1)/2):size-1-draft.edges[opposite];
 function preview(next){touched.current=true;prefill.current=false;latest.current=next;setDraft(next);if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=null;callbacks.current.onPreview(latest.current);});}
 function commit(){
  clearTimeout(timer.current);cancelAnimationFrame(frame.current);frame.current=null;
  if(!touched.current){callbacks.current.onPreview(null);return Promise.resolve();}
  touched.current=false;return Promise.resolve(callbacks.current.onCommit(latest.current));
 }
 flushRef.current=commit;useImperativeHandle(ref,()=>({flush:()=>flushRef.current()}),[]);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>()=>{clearTimeout(timer.current);cancelAnimationFrame(frame.current);},[]);
 useEffect(()=>{closing.current=false;if(!open){const next=initial();latest.current=next;setDraft(next);touched.current=false;prefill.current=value==null;setMode('crop');}},[open,value]);
 function close(){if(closing.current)return;closing.current=true;commit().then(()=>callbacks.current.onClose()).catch(e=>{closing.current=false;setError(e.message);});}
 useEffect(()=>{
  if(!open||hidden||disabled)return;
  const dismiss=e=>{if(!root.current?.contains(e.target)&&!e.target.closest('[data-canvas-split]')&&!pointer.current)close();};
  document.addEventListener('pointerdown',dismiss,true);document.addEventListener('click',dismiss,true);return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('click',dismiss,true);};
 },[open,hidden,disabled]);
 async function activate(next){
  try{await commit();if(open&&mode===next){onClose();return;}setMode(next);onActivate();onSplitDraft(next==='split'?{axis:image.width>=2?'x':'y',at:Math.floor((image.width>=2?image.width:image.height)/2)}:null);}
  catch(e){setError(e.message);}
 }
 function chooseSide(next){
  if(prefill.current&&axis!==(['left','right'].includes(next)?'horizontal':'vertical')){const clean={edges:{...empty},links:{...latest.current.links}};latest.current=clean;setDraft(clean);prefill.current=false;}
  setSide(next);
 }
 function change(raw){preview({...latest.current,edges:changeCropEdge(image,latest.current.edges,side,raw,latest.current.links[axis])});clearTimeout(timer.current);if(!pointer.current)timer.current=setTimeout(()=>commit().catch(e=>setError(e.message)),450);}
 function finish(){pointer.current=false;commit().catch(e=>setError(e.message));}
 function link(){
  const current=prefill.current?{...latest.current,edges:{...empty}}:latest.current,enabled=!current.links[axis];
  preview({...current,links:{...current.links,[axis]:enabled},edges:enabled?changeCropEdge(image,current.edges,side,current.edges[side],true):current.edges});commit().catch(e=>setError(e.message));
 }
 return <div ref={root} className="inline-image-controls" hidden={hidden} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
  <div className="inline-image-tools editor-mode" role="group" aria-label="图片操作" style={placementRef.current.tools}>
   <button className={open&&mode==='crop'?'active':''} aria-pressed={open&&mode==='crop'} disabled={disabled} onClick={()=>activate('crop')}><Crop size={17}/>裁剪</button>
   <button className={open&&mode==='split'?'active':''} aria-pressed={open&&mode==='split'} disabled={disabled||image.width<2&&image.height<2} onClick={()=>activate('split')}><Scissors size={17}/>分割</button>
  </div>
  {open&&<section className="image-editor inline-image-editor" aria-label={mode==='split'?'分割设置':'裁剪设置'} style={placementRef.current.panel}>
   {mode==='split'&&splitDraft?<ImageSplitControls image={image} value={splitDraft} onChange={onSplitDraft} disabled={disabled} onConfirm={onSplit} onCancel={close}/>:<>
    <div className="crop-edge-options" role="group" aria-label="裁剪边">{Object.entries(names).map(([edge,label])=><button key={edge} aria-label={`裁剪${label}边`} aria-pressed={side===edge} className={side===edge?'active':''} disabled={disabled} onClick={()=>chooseSide(edge)}>{label}</button>)}
     <button className={`crop-link ${linked?'active':''}`} aria-label={`关联${axis==='horizontal'?'左右':'上下'}裁剪`} aria-pressed={linked} title={linked?'已关联，点击单独调整':'点击关联两侧'} disabled={disabled} onClick={link}>{linked?<LinkSimple size={17}/>:<LinkSimpleBreak size={17}/>}</button>
     <button className="crop-reset" aria-label="重置此图裁剪" title="重置此图裁剪" disabled={disabled} onClick={()=>{preview({...latest.current,edges:{...empty}});commit().catch(e=>setError(e.message));}}><ArrowCounterClockwise size={17}/></button>
    </div>
    <div className="inline-crop-value"><label htmlFor="crop-amount">{linked?(axis==='horizontal'?'左右各裁':'上下各裁'):`${names[side]}方裁剪`}</label><div className="number-with-unit"><input id="crop-amount" aria-label="裁剪像素" type="number" min="0" max={max} step="1" value={amount} disabled={disabled} onFocus={event=>event.target.select()} onChange={event=>change(event.target.value)} onBlur={()=>{if(!pointer.current)finish();}} onKeyDown={event=>{if(event.key==='Enter')finish();}}/><span>px</span></div></div>
    <input className="crop-slider" aria-label="裁剪滑块" style={{'--crop-progress':`${100*amount/Math.max(1,max)}%`}} type="range" min="0" max={max} step="1" value={amount} disabled={disabled} onPointerDown={event=>{pointer.current=true;clearTimeout(timer.current);try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}}} onChange={event=>change(event.target.value)} onPointerUp={finish} onPointerCancel={finish} onKeyUp={finish}/>
   </>}
   {error&&<p className="split-error" role="alert">{error}</p>}
  </section>}
 </div>;
});
