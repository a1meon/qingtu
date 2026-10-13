import {memo,useEffect,useRef} from 'react';
import {CaretLeft,CaretRight,SpinnerGap,ImageSquare} from '@phosphor-icons/react';

// Pointer movement never updates React state. Multiple events in one frame
// collapse into one local CSS update, leaving the queue and inspector untouched.
export const ImagePreview=memo(function ImagePreview({selected,output,processing,view,error}){
 const canvas=useRef(),slider=useRef(),frame=useRef(0),split=useRef(50),bounds=useRef(null);
 const compare=view==='compare';
 function update(value){
  split.current=Math.max(0,Math.min(100,value));
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=0;
   canvas.current?.style.setProperty('--split',`${split.current}%`);
   if(slider.current)slider.current.value=split.current;
  });
 }
 function move(event){
  if(!event.buttons)return;
  const rect=bounds.current||canvas.current.getBoundingClientRect();
  update((event.clientX-rect.left)/rect.width*100);
 }
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 const source=view==='original'?selected.preview:output?.preview;
 return <div ref={canvas} className={`comparator ${compare?'':'single-view'}`} style={{aspectRatio:`${selected.width} / ${selected.height}`,'--split':`${split.current}%`}}>
  {source?<img className="compare-image" src={source} alt={view==='original'?'原始图片':output?'处理后的图片':'待处理图片'} draggable={false}/>:<div className="preview-pending" role="status" aria-label={processing?'正在生成处理结果':'尚无处理结果'}>{processing?<SpinnerGap size={23} className="spin"/>:<ImageSquare size={32} weight="thin"/>}</div>}
  {compare&&<>
   <img className="compare-image original-image" src={selected.preview} alt="原始图片" draggable={false}/>
   <span className="image-label original-label">原图</span>
   <div className="split-line"><span className="split-handle"><CaretLeft size={13}/><CaretRight size={13}/></span></div>
   <input ref={slider} className="compare-slider" type="range" aria-label="原图与处理结果对比" defaultValue={split.current} min="0" max="100" onInput={e=>update(Number(e.target.value))}/>
   <div className="drag-comparison" aria-hidden onPointerDown={e=>{bounds.current=canvas.current.getBoundingClientRect();e.currentTarget.setPointerCapture(e.pointerId);update((e.clientX-bounds.current.left)/bounds.current.width*100);}} onPointerMove={move} onPointerUp={e=>{if(bounds.current)update((e.clientX-bounds.current.left)/bounds.current.width*100);bounds.current=null;}} onPointerCancel={()=>{bounds.current=null;}}/>
  </>}
  <span className="image-label processed-label">{view==='original'?'原图':processing?'处理中':output?output.unchanged?'处理后 · 未改动':'处理后':error?'未生成':'待处理'}</span>
 </div>;
});
