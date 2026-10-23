import {memo,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {CaretLeft,CaretRight,SpinnerGap,ImageSquare} from '@phosphor-icons/react';

// Pointer movement never updates React state. Multiple events in one frame
// collapse into one local CSS update, leaving the queue and inspector untouched.
export const ImagePreview=memo(function ImagePreview({selected,output,processing,view,error}){
 const canvas=useRef(),slider=useRef(),frame=useRef(0),split=useRef(50),bounds=useRef(null);
 const compare=view==='compare',[decoded,setDecoded]=useState(null),[decodeFailure,setDecodeFailure]=useState(null);
 useEffect(()=>{
  let live=true;const preview=output?.preview;
  if(!preview){setDecoded(null);setDecodeFailure(null);return;}
  const image=new Image();image.src=preview;
  image.decode().then(()=>{if(live)setDecoded(preview);}).catch(()=>{if(live)setDecodeFailure(preview);});
  return()=>{live=false;};
 },[output?.preview]);
 function positionLoader(rect){
  const element=canvas.current;if(!element)return;
  const {width,height}=rect||element.getBoundingClientRect();if(!width||!height)return;
  const imageWidth=Math.min(width,height*selected.width/selected.height),divider=compare?width*split.current/100:0;
  const left=Math.max(divider,(width-imageWidth)/2),right=(width+imageWidth)/2;
  element.style.setProperty('--loading-x',`${right>left?(left+right)/2:(divider+width)/2}px`);
 }
 useLayoutEffect(()=>{const observer=new ResizeObserver(()=>positionLoader());observer.observe(canvas.current);positionLoader();return()=>observer.disconnect();},[selected.width,selected.height,compare]);
 function update(value){
  split.current=Math.max(0,Math.min(100,value));
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=0;
   canvas.current?.style.setProperty('--split',`${split.current}%`);
   positionLoader(bounds.current);
   if(slider.current)slider.current.value=split.current;
  });
 }
 function move(event){
  if(!event.buttons)return;
  const rect=bounds.current||canvas.current.getBoundingClientRect();
  update((event.clientX-rect.left)/rect.width*100);
 }
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 const previewError=error||(output?.preview&&decodeFailure===output.preview?'预览加载失败':'');
 const waiting=view!=='original'&&!previewError&&(processing||!!output?.preview&&decoded!==output.preview);
 const source=view==='original'?selected.preview:output?.preview===decoded?decoded:null;
 return <div ref={canvas} className={`comparator ${compare?'':'single-view'}`} aria-busy={!!waiting} style={{aspectRatio:`${selected.width} / ${selected.height}`,'--split':`${split.current}%`}}>
  {source?<img className={`compare-image ${view==='original'?'':'processed-image'}`} src={source} alt={view==='original'?'原始图片':'处理后的图片'} draggable={false}/>:waiting?<div className="preview-loading" role="status" aria-label="正在生成处理结果">
   <img className="compare-image preview-loading-source" src={selected.preview} alt="" aria-hidden draggable={false}/>
   <div className="preview-loading-indicator"><span className="preview-loading-spinner"><SpinnerGap size={22} className="spin" aria-hidden/></span></div>
  </div>:<div className="preview-pending" role="status" aria-label={previewError?'预览加载失败':'尚无处理结果'}><ImageSquare size={32} weight="thin"/></div>}
  {compare&&<>
   <img className="compare-image original-image" src={selected.preview} alt="原始图片" draggable={false}/>
   <span className="image-label original-label">原图</span>
   <div className="split-line"><span className="split-handle"><CaretLeft size={13}/><CaretRight size={13}/></span></div>
   <input ref={slider} className="compare-slider" type="range" aria-label="原图与处理结果对比" defaultValue={split.current} min="0" max="100" onInput={e=>update(Number(e.target.value))}/>
   <div className="drag-comparison" aria-hidden onPointerDown={e=>{bounds.current=canvas.current.getBoundingClientRect();e.currentTarget.setPointerCapture(e.pointerId);update((e.clientX-bounds.current.left)/bounds.current.width*100);}} onPointerMove={move} onPointerUp={e=>{if(bounds.current)update((e.clientX-bounds.current.left)/bounds.current.width*100);bounds.current=null;}} onPointerCancel={()=>{bounds.current=null;}}/>
  </>}
  <span className="image-label processed-label">{view==='original'?'原图':waiting?'处理中':previewError?'未生成':output?output.unchanged?'处理后 · 未改动':'处理后':'待处理'}</span>
 </div>;
});
