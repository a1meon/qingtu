import {useEffect,useRef,useState} from 'react';
import {snapPosition} from '../../engine/stitch-layout.mjs';
import {addFlushHandler} from '../lifecycle.js';

export function StitchCanvas({project,layout,onChange,onEdit,onRemove,onReorder,selected,onSelect,disabled}){
 const area=useRef(),canvas=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),[bounds,setBounds]=useState({width:600,height:360});
 flushRef.current=()=>finish(false);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>setBounds(entries[0].contentRect));observer.observe(area.current);return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};},[]);
 const scale=layout?Math.min((bounds.width-50)/layout.width,(bounds.height-35)/layout.height):1;
 const selectedRect=layout?.rects.find(rect=>rect.id===selected);
 const selectedImage=project.images.find(image=>image.id===selected);
 function showRect(element,rect){if(element)Object.assign(element.style,{left:rect.x*scale+'px',top:rect.y*scale+'px',width:rect.width*scale+'px',height:rect.height*scale+'px'});}
 function start(event,rect,resize=false){
  if(disabled||event.button!==0||resize&&project.layout!=='free')return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);event.currentTarget.setPointerCapture(event.pointerId);
  const original=project.positions[rect.id],worldScale=original?original.width/rect.width:1,box=canvas.current.getBoundingClientRect();
  gesture.current={id:rect.id,rect,original,worldScale,resize,order:project.layout!=='free',startX:event.clientX,startY:event.clientY,pointerX:(event.clientX-box.left)/scale,pointerY:(event.clientY-box.top)/scale,element:canvas.current.querySelector(`[data-image-id="${rect.id}"]`)};
 }
 function move(event){
  const g=gesture.current;if(!g)return;
  g.dx=(event.clientX-g.startX)/scale;g.dy=(event.clientY-g.startY)/scale;
  if(frame.current)return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=null;
   if(gesture.current!==g)return;
   const rect=nextRect(g);
   g.next=rect;
   if(g.order){g.element.style.transform=`translate(${(g.dx||0)*scale}px,${(g.dy||0)*scale}px)`;g.element.style.opacity='.65';}
   else showRect(g.element,rect);
   showRect(canvas.current.querySelector('.stitch-selection'),rect);
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   if(g.order){const target=orderTarget(g);if(target&&target.id!==g.id){const guide=document.createElement('span');guide.className='reorder-indicator';Object.assign(guide.style,{left:target.x*scale+'px',top:target.y*scale+'px',width:target.width*scale+'px',height:target.height*scale+'px'});guides.append(guide);}}
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
  });
 }
 function nextRect(g){
  if(g.order)return {...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)};
  if(g.resize){const ratio=g.rect.height/g.rect.width;const delta=Math.abs(g.dx||0)>Math.abs((g.dy||0)/ratio)?g.dx||0:(g.dy||0)/ratio;const width=Math.max(1,g.rect.width+delta);return {...g.rect,width,height:width*ratio};}
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},layout.rects.filter(r=>r.id!==g.id),8/scale)};
 }
 function orderTarget(g){const x=g.pointerX+(g.dx||0),y=g.pointerY+(g.dy||0);return layout.rects.find(rect=>x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height);}
 function end(event,cancelled=false){
  const g=gesture.current;if(!g)return;
  if(!cancelled){g.dx=(event.clientX-g.startX)/scale;g.dy=(event.clientY-g.startY)/scale;}
  return finish(cancelled);
 }
 function finish(cancelled){
  const g=gesture.current;if(!g)return;
  cancelAnimationFrame(frame.current);frame.current=null;
  const rect=nextRect(g);gesture.current=null;canvas.current.querySelector('.snap-guides').replaceChildren();
  g.element.style.transform='';g.element.style.opacity='';
  if(cancelled){showRect(g.element,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);return;}
  if(Math.hypot((g.dx||0)*scale,(g.dy||0)*scale)<3){showRect(g.element,g.rect);showRect(canvas.current.querySelector('.stitch-selection'),g.rect);return;}
  if(g.order){showRect(canvas.current.querySelector('.stitch-selection'),g.rect);const target=orderTarget(g);if(target&&target.id!==g.id)return onReorder(g.id,target.id);return;}
  const position={x:g.original.x+(rect.x-g.rect.x)*g.worldScale,y:g.original.y+(rect.y-g.rect.y)*g.worldScale,width:rect.width*g.worldScale};
  return onChange({...project.positions,[g.id]:position});
 }
 return <div className="stitch-canvas-area" ref={area}>
  {layout?<div ref={canvas} className="stitch-canvas checkerboard" style={{width:layout.width*scale,height:layout.height*scale}}>
   {layout.rects.map(rect=>{
    const image=project.images.find(i=>i.id===rect.id);
    return <div data-image-id={rect.id} className={`stitch-layer ${selected===rect.id?'selected':''} ${project.layout==='free'?'movable':'reorderable'}`} key={rect.id} style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale}} tabIndex={0} role="button" aria-label={`编辑 ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>start(e,rect)} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>end(e,true)} onClick={()=>onSelect(rect.id)} onDoubleClick={()=>{if(!disabled)onEdit(rect.id);}} onKeyDown={event=>{
     if(disabled)return;
     if(event.key==='Enter'){event.preventDefault();onEdit(rect.id);return;}
     if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();onRemove(rect.id);return;}
     if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
     if(project.layout!=='free'){if(event.altKey){event.preventDefault();const index=project.images.findIndex(image=>image.id===rect.id),target=project.images[index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];if(target)onReorder(rect.id,target.id);}return;}
     event.preventDefault();const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
    }}>
     <img src={image.preview} alt="" draggable={false} style={rect.crop?{position:'absolute',maxWidth:'none',width:`${100/(1-rect.crop.left-rect.crop.right)}%`,height:`${100/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`,left:`${-100*rect.crop.left/(1-rect.crop.left-rect.crop.right)}%`,top:`${-100*(rect.crop.top||0)/(1-(rect.crop.top||0)-(rect.crop.bottom||0))}%`}:undefined}/>
    </div>;
   })}
   {selectedRect&&<div className="stitch-selection" style={{left:selectedRect.x*scale,top:selectedRect.y*scale,width:selectedRect.width*scale,height:selectedRect.height*scale}} aria-hidden={project.layout!=='free'}>
    {project.layout==='free'&&<button className="resize-handle" aria-label={`等比缩放 ${selectedImage.name}`} onPointerDown={e=>start(e,selectedRect,true)} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>end(e,true)}/>}
   </div>}
   <div className="snap-guides" aria-hidden/>
  </div>:<div className="stitch-invalid">请调整布局</div>}
 </div>;
}
