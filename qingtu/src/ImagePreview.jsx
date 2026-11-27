import {memo,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ZoomControls} from './ZoomControls.jsx';
import {useCanvasNavigation} from './stitch/useCanvasNavigation.js';
import {SpinnerGap,ImageSquare} from '@phosphor-icons/react';
import {ComparisonDivider} from './ComparisonDivider.jsx';

// Comparison-slider movement bypasses React. Multiple events in one frame
// collapse into one local CSS update, leaving the queue and inspector untouched.
export const ImagePreview=memo(function ImagePreview({selected,output,processing,view,error,navigationSlot}){
 const canvas=useRef(),split=useRef(50);
 const [viewport,setViewport]=useState({width:0,height:0});
 useLayoutEffect(()=>{
  const node=canvas.current;
  const measure=()=>setViewport({width:node.clientWidth,height:node.clientHeight});
  const observer=new ResizeObserver(measure);observer.observe(node);measure();
  return()=>observer.disconnect();
 },[]);
 const fitted=image=>{
  const scale=Math.min(viewport.width/image.width,viewport.height/image.height);
  return {width:image.width*scale,height:image.height*scale};
 };
 const original=fitted(selected),processed=output?.width&&output.height?fitted(output):original;
 const content=view==='original'?original:view==='processed'?processed:{width:Math.max(original.width,processed.width),height:Math.max(original.height,processed.height)};
 const navigation=useCanvasNavigation({area:canvas,projectId:selected.id,viewport,content,dragByDefault:view!=='compare'});
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
  const imageWidth=Math.min(width,height*selected.width/selected.height)*navigation.zoom,divider=compare?width*split.current/100:0;
  const left=Math.max(divider,(width-imageWidth)/2+navigation.x),right=Math.min(width,(width+imageWidth)/2+navigation.x);
  element.style.setProperty('--loading-x',`${right>left?(left+right)/2:(divider+width)/2}px`);
 }
 useLayoutEffect(()=>{positionLoader(viewport);},[viewport,selected.width,selected.height,compare,navigation.zoom,navigation.x]);
 const previewError=error||(output?.preview&&decodeFailure===output.preview?'预览加载失败':'');
 const waiting=view!=='original'&&!previewError&&(processing||!!output?.preview&&decoded!==output.preview);
 const source=view==='original'?selected.preview:output?.preview===decoded?decoded:null;
 return <><div ref={canvas} data-pan-mode={navigation.canPan&&!compare||undefined} className={`comparator ${compare?'':'single-view'}`} aria-busy={!!waiting} style={{aspectRatio:`${selected.width} / ${selected.height}`,'--split':`${split.current}%`,'--preview-zoom':navigation.zoom,'--preview-x':navigation.x+'px','--preview-y':navigation.y+'px'}}>
  {source?<img className={`compare-image ${view==='original'?'':'processed-image'}`} src={source} alt={view==='original'?'原始图片':'处理后的图片'} draggable={false}/>:waiting?<div className="preview-loading" role="status" aria-label="正在生成处理结果">
   <img className="compare-image preview-loading-source" src={selected.preview} alt="" aria-hidden draggable={false}/>
   <div className="preview-loading-indicator"><span className="preview-loading-spinner"><SpinnerGap size={22} className="spin" aria-hidden/></span></div>
  </div>:<div className="preview-pending" role="status" aria-label={previewError?'预览加载失败':'尚无处理结果'}><ImageSquare size={32} weight="thin"/></div>}
  {compare&&<>
   <div className="original-slice"><img className="compare-image original-image" src={selected.preview} alt="原始图片" draggable={false}/></div>
   <span className="image-label original-label">原图</span>
   <ComparisonDivider container={canvas} position={split} onChange={positionLoader}/>
  </>}
  {!waiting&&<span className="image-label processed-label">{view==='original'?'原图':previewError?'未生成':output?output.unchanged?'处理后 · 未改动':'处理后':'待处理'}</span>}
 </div>{navigationSlot&&createPortal(<ZoomControls navigation={navigation}/>,navigationSlot)}</>;
});
