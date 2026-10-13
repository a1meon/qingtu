import {useEffect,useRef,useState} from 'react';
import {snapPosition} from '../../engine/stitch-layout.mjs';
import {addFlushHandler} from '../lifecycle.js';

export function StitchCanvas({project,layout,onChange,selected,onSelect,disabled}){
 const area=useRef(),canvas=useRef(),gesture=useRef(),frame=useRef(),flushRef=useRef(),[bounds,setBounds]=useState({width:600,height:360});
 flushRef.current=()=>finish(false);
 useEffect(()=>addFlushHandler(()=>flushRef.current()),[]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>setBounds(entries[0].contentRect));observer.observe(area.current);return()=>{observer.disconnect();cancelAnimationFrame(frame.current);};},[]);
 const scale=layout?Math.min((bounds.width-50)/layout.width,(bounds.height-35)/layout.height):1;
 function start(event,rect,resize=false){
  if(disabled||project.layout!=='free'||event.button!==0)return;
  event.preventDefault();event.stopPropagation();onSelect(rect.id);event.currentTarget.setPointerCapture(event.pointerId);
  const original=project.positions[rect.id],worldScale=original.width/rect.width;
  gesture.current={id:rect.id,rect,original,worldScale,resize,startX:event.clientX,startY:event.clientY,element:canvas.current.querySelector(`[data-image-id="${rect.id}"]`)};
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
   Object.assign(g.element.style,{left:rect.x*scale+'px',top:rect.y*scale+'px',width:rect.width*scale+'px',height:rect.height*scale+'px'});
   const guides=canvas.current.querySelector('.snap-guides');guides.replaceChildren();
   for(const line of rect.guides||[]){const guide=document.createElement('span');guide.className=`snap-guide ${line.axis}`;guide.style[line.axis==='x'?'left':'top']=line.value*scale+'px';guides.append(guide);}
  });
 }
 function nextRect(g){
  if(g.resize){const ratio=g.rect.height/g.rect.width;const delta=Math.abs(g.dx||0)>Math.abs((g.dy||0)/ratio)?g.dx||0:(g.dy||0)/ratio;const width=Math.max(1,g.rect.width+delta);return {...g.rect,width,height:width*ratio};}
  return {...g.rect,...snapPosition({...g.rect,x:g.rect.x+(g.dx||0),y:g.rect.y+(g.dy||0)},layout.rects.filter(r=>r.id!==g.id),8/scale)};
 }
 function end(event,cancelled=false){
  const g=gesture.current;if(!g)return;
  if(!cancelled){g.dx=(event.clientX-g.startX)/scale;g.dy=(event.clientY-g.startY)/scale;}
  return finish(cancelled);
 }
 function finish(cancelled){
  const g=gesture.current;if(!g)return;
  cancelAnimationFrame(frame.current);frame.current=null;
  const rect=nextRect(g);gesture.current=null;canvas.current.querySelector('.snap-guides').replaceChildren();
  if(cancelled){Object.assign(g.element.style,{left:g.rect.x*scale+'px',top:g.rect.y*scale+'px',width:g.rect.width*scale+'px',height:g.rect.height*scale+'px'});return;}
  const position={x:g.original.x+(rect.x-g.rect.x)*g.worldScale,y:g.original.y+(rect.y-g.rect.y)*g.worldScale,width:rect.width*g.worldScale};
  return onChange({...project.positions,[g.id]:position});
 }
 return <div className="stitch-canvas-area" ref={area}>
  {layout?<div ref={canvas} className="stitch-canvas checkerboard" style={{width:layout.width*scale,height:layout.height*scale}}>
   {layout.rects.map(rect=>{
    const image=project.images.find(i=>i.id===rect.id);
    return <div data-image-id={rect.id} className={`stitch-layer ${selected===rect.id?'selected':''} ${project.layout==='free'?'movable':''}`} key={rect.id} style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale}} tabIndex={0} role="button" aria-label={`编辑 ${image.name}`} onFocus={()=>onSelect(rect.id)} onPointerDown={e=>start(e,rect)} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>end(e,true)} onClick={()=>onSelect(rect.id)} onKeyDown={event=>{
     if(project.layout!=='free'||disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const p=project.positions[rect.id],distance=event.shiftKey?10:1;onChange({...project.positions,[rect.id]:{...p,x:p.x+(event.key==='ArrowLeft'?-distance:event.key==='ArrowRight'?distance:0),y:p.y+(event.key==='ArrowUp'?-distance:event.key==='ArrowDown'?distance:0)}});
    }}>
     <img src={image.preview} alt="" draggable={false} style={rect.crop?{height:'100%',width:'auto',maxWidth:'none',position:'absolute',left:'50%',transform:'translateX(-50%)'}:undefined}/>
     {project.layout==='free'&&selected===rect.id&&<button className="resize-handle" aria-label={`等比缩放 ${image.name}`} onPointerDown={e=>start(e,rect,true)} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>end(e,true)}/>}
    </div>;
   })}
   <div className="snap-guides" aria-hidden/>
  </div>:<div className="stitch-invalid">请调整布局</div>}
 </div>;
}
