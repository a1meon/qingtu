import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Crop,Scissors,LinkSimple,LinkSimpleBreak,ArrowCounterClockwise} from '@phosphor-icons/react';
import {cropEdges,changeCropEdge} from '../../engine/stitch-edits.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {ImageSplitControls} from './ImageSplitControls.jsx';
import {CanvasCropOverlay} from './CanvasCropOverlay.jsx';

const empty={left:0,right:0,top:0,bottom:0};
const names={left:'左',right:'右',top:'上',bottom:'下'};
const pairs=[{axis:'horizontal',sides:['left','right'],name:'左右'},{axis:'vertical',sides:['top','bottom'],name:'上下'}];
export const ImageEditor=forwardRef(function ImageEditor({image,value,open,placement,hidden,onActivate,onPreview,onCommit,onSplit,splitDraft,onSplitDraft,onClose,disabled},ref){
 const original=()=>({edges:cropEdges(image,value),links:{horizontal:value?.links?.horizontal??true,vertical:value?.links?.vertical??false}});
 const initial=()=>value==null?{edges:{...empty,left:Math.min(50,Math.floor((image.width-1)/2)),right:Math.min(50,Math.floor((image.width-1)/2))},links:{horizontal:true,vertical:false}}:original();
 const [mode,setMode]=useState('crop'),[side,setSide]=useState('left'),[draft,setDraft]=useState(initial),[error,setError]=useState('');
 const root=useRef(),latest=useRef(draft),touched=useRef(false),prefill=useRef(value==null),pointer=useRef(false),dragBefore=useRef(),cropClick=useRef(),timer=useRef(),frame=useRef(),callbacks=useRef(),flushRef=useRef(),closing=useRef(false),placementRef=useRef(placement);
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
  const dismiss=e=>{
   if(e.type==='pointerdown')cropClick.current=undefined;
   // Releasing an edge after cancellation can synthesize a click on the
   // picture below it. Consume only that pointer's trailing click.
   if(e.type==='click'&&cropClick.current!==undefined){const id=cropClick.current;cropClick.current=undefined;if(e.pointerId===id){e.preventDefault();e.stopPropagation();return;}}
   if(!root.current?.contains(e.target)&&!e.target.closest('[data-canvas-split]')&&!pointer.current)close();
  };
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
 function change(raw){const current=prefill.current&&axis==='vertical'?{...latest.current,edges:{...empty}}:latest.current;preview({...current,edges:changeCropEdge(image,current.edges,side,raw,current.links[axis])});clearTimeout(timer.current);if(!pointer.current)timer.current=setTimeout(()=>commit().catch(e=>setError(e.message)),450);}
 function finish(){pointer.current=false;commit().catch(e=>setError(e.message));}
 function startCrop(edge){
  clearTimeout(timer.current);cancelAnimationFrame(frame.current);frame.current=null;
  dragBefore.current={draft:latest.current,touched:touched.current,prefill:prefill.current,side};pointer.current=true;setSide(edge);
  callbacks.current.onPreview(prefill.current?original():latest.current,{position:placement.rect});
 }
 function previewCrop(edit,position){touched.current=true;prefill.current=false;latest.current=edit;setDraft(edit);callbacks.current.onPreview(edit,{position});}
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
  <div className="inline-image-tools editor-mode" role="group" aria-label="图片操作" style={placementRef.current.tools}>
   <button className={open&&mode==='crop'?'active':''} aria-pressed={open&&mode==='crop'} disabled={disabled} onClick={()=>activate('crop')}><Crop size={17}/>裁剪</button>
   <button className={open&&mode==='split'?'active':''} aria-pressed={open&&mode==='split'} disabled={disabled||image.width<2&&image.height<2} onClick={()=>activate('split')}><Scissors size={17}/>分割</button>
  </div>
  {open&&<section className="image-editor inline-image-editor" aria-label={mode==='split'?'分割设置':'裁剪设置'} style={placementRef.current.panel}>
   {mode==='split'&&splitDraft?<ImageSplitControls image={image} value={splitDraft} onChange={onSplitDraft} disabled={disabled} onConfirm={onSplit} onCancel={close}/>:<>
    <div className="crop-edge-options" role="group" aria-label="裁剪边">{pairs.map(pair=><div key={pair.axis} className="crop-edge-pair" role="group" aria-label={`${pair.name}裁剪`}>
     {edgeButton(pair.sides[0],pair.axis)}
     <button className={`crop-link ${axis===pair.axis&&draft.links[pair.axis]?'active':''}`} aria-label={`关联${pair.name}裁剪`} aria-pressed={draft.links[pair.axis]} title={`${draft.links[pair.axis]?'取消':'开启'}${pair.name}联动`} disabled={disabled} onClick={()=>link(pair.axis)}>{draft.links[pair.axis]?<LinkSimple size={16}/>:<LinkSimpleBreak size={16}/>}</button>
     {edgeButton(pair.sides[1],pair.axis)}
    </div>)}
     <button className="crop-reset" aria-label="重置此图裁剪" title="重置此图裁剪" disabled={disabled} onClick={()=>{preview({...latest.current,edges:{...empty}});commit().catch(e=>setError(e.message));}}><ArrowCounterClockwise size={17}/></button>
    </div>
    <div className="inline-crop-value"><label htmlFor="crop-amount">{linked?(axis==='horizontal'?'左右各裁':'上下各裁'):`${names[side]}方裁剪`}</label><div className="number-with-unit"><input id="crop-amount" aria-label="裁剪像素" type="number" min="0" max={max} step="1" value={amount} disabled={disabled} onFocus={event=>event.target.select()} onChange={event=>change(event.target.value)} onBlur={()=>{if(!pointer.current)finish();}} onKeyDown={event=>{if(event.key==='Enter')finish();}}/><span>px</span></div></div>
   </>}
   {error&&<p className="split-error" role="alert">{error}</p>}
  </section>}
 </div>;
});
