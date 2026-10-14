import {useEffect,useRef,useState} from 'react';
import {cropFractions} from '../../engine/stitch-edits.mjs';

export function ImageSplitControls({image,onConfirm,disabled}){
 const [axis,setAxis]=useState(image.width>=2?'x':'y'),[at,setAt]=useState(Math.floor((image.width>=2?image.width:image.height)/2)),[working,setWorking]=useState(false),[error,setError]=useState('');
 const stage=useRef(),line=useRef(),gesture=useRef(),frame=useRef(),latest=useRef(at),trackRef=useRef(),finishRef=useRef();
 const size=axis==='x'?image.width:image.height,crop=cropFractions(image,{left:0,top:0,width:image.width,height:image.height});
 function place(value){if(line.current)line.current.style[axis==='x'?'left':'top']=`${value/size*100}%`;}
 function direction(value){if(value===axis)return;setAxis(value);const next=Math.floor((value==='x'?image.width:image.height)/2);latest.current=next;setAt(next);}
 function start(event){if(disabled||working||event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={id:event.pointerId,box:stage.current.getBoundingClientRect()};}
 function move(event){const drag=gesture.current;if(!drag||event.pointerId!==drag.id)return;const fraction=axis==='x'?(event.clientX-drag.box.left)/drag.box.width:(event.clientY-drag.box.top)/drag.box.height;latest.current=Math.max(1,Math.min(size-1,Math.round(fraction*size)));if(frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=null;place(latest.current);});}
 function finish(event){if(!gesture.current||event.pointerId!==gesture.current.id)return;if(event.type!=='pointercancel')move(event);gesture.current=null;cancelAnimationFrame(frame.current);frame.current=null;setAt(latest.current);place(latest.current);}
 trackRef.current=move;finishRef.current=finish;
 useEffect(()=>{const move=e=>trackRef.current(e),end=e=>finishRef.current(e);document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);return()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);cancelAnimationFrame(frame.current);};},[]);
 function number(raw){const next=Math.max(1,Math.min(size-1,Math.round(Number(raw)||1)));latest.current=next;setAt(next);}
 async function confirm(){setWorking(true);setError('');try{await onConfirm(axis,latest.current);}catch(e){setError(e.message);setWorking(false);}}
 return <div className="image-split-controls">
  <div className="crop-direction" role="group" aria-label="拆分方向">{[['y','水平',image.height],['x','垂直',image.width]].map(([value,label,length])=><button key={value} aria-pressed={axis===value} className={axis===value?'active':''} disabled={disabled||working||length<2} onClick={()=>direction(value)}>{label}</button>)}</div>
  <div className="split-preview-frame"><div ref={stage} className="split-image-preview" style={{aspectRatio:`${image.width} / ${image.height}`,width:`${Math.min(252,176*image.width/image.height)}px`}}>
   <img src={image.preview} alt="完整原图拆分预览" draggable={false} style={crop?{width:`${100/(1-crop.left-crop.right)}%`,height:`${100/(1-crop.top-crop.bottom)}%`,left:`${-100*crop.left/(1-crop.left-crop.right)}%`,top:`${-100*crop.top/(1-crop.top-crop.bottom)}%`}:undefined}/>
   <button ref={line} className={`split-divider split-${axis}`} aria-label="拖动分割线" disabled={disabled||working||size<2} style={axis==='x'?{left:`${at/size*100}%`}:{top:`${at/size*100}%`}} onPointerDown={start} onKeyDown={event=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(event.key)){event.preventDefault();number(latest.current+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)*(event.shiftKey?10:1));}}}><span className="split-grip"/></button>
  </div></div>
  <div className="split-source-size">原图 {image.width} × {image.height}</div>
  <label htmlFor="split-at">分割位置</label><div className="number-with-unit"><input id="split-at" aria-label="分割位置" type="number" min="1" max={size-1} value={at} disabled={disabled||working||size<2} onChange={e=>number(e.target.value)}/><span>px</span></div>
  {error&&<p className="split-error" role="alert">{error}</p>}
  <button className="split-confirm crop-done" disabled={disabled||working||size<2} onClick={confirm}>{working?'拆分中…':'确认拆分'}</button>
 </div>;
}
