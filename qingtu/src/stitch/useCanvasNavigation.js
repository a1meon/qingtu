import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {constrainCamera,panLimits,stepCanvasZoom,wheelZoomFactor,zoomCanvasCamera} from './canvas-viewport.js';

const home={zoom:1,x:0,y:0};
const sameCamera=(a,b)=>a.zoom===b.zoom&&a.x===b.x&&a.y===b.y;
const isControl=target=>target.closest('button,input,textarea,select,[contenteditable="true"],.inline-image-editor,.inline-image-tools,.stitch-compare-drag');

export function useCanvasNavigation({area,projectId,blocked=false,viewport,content,dragByDefault=false}){
 const [stored,setStored]=useState({...home,id:projectId}),latest=useRef(),held=useRef(false);
 const camera=constrainCamera(stored.id===projectId?stored:home,viewport,content);
 const limits=panLimits(camera.zoom,viewport,content),canPan=limits.minX<limits.maxX||limits.minY<limits.maxY;
 latest.current={projectId,blocked,viewport,content,canPan,dragByDefault};
 const change=useCallback(transform=>{
  const {projectId,viewport,content}=latest.current;
  setStored(previous=>{
   const before=constrainCamera(previous.id===projectId?previous:home,viewport,content);
   const next=constrainCamera({...before,...transform(before)},viewport,content);
   return previous.id===projectId&&sameCamera(previous,next)?previous:{...next,id:projectId};
  });
 },[]);
 useLayoutEffect(()=>{change(()=>({}));},[projectId,viewport.width,viewport.height,content.width,content.height,content.centerX,content.centerY,change]);
 function step(direction){
  if(!blocked&&!held.current)change(before=>zoomCanvasCamera(before,stepCanvasZoom(before.zoom,direction)/before.zoom));
 }
 useEffect(()=>{
  const node=area.current;if(!node)return;
  let drag=null,space=false,suppressClick=false;
  const pan=(dx,dy)=>change(before=>({x:before.x+dx,y:before.y+dy}));
  function wheel(event){
   if(event.target.closest('.inline-image-tools,.inline-image-editor,.empty-state button'))return;
   const zoom=event.ctrlKey||event.metaKey;
   if(!zoom&&!latest.current.canPan)return;
   event.preventDefault();
   if(latest.current.blocked||held.current)return;
   if(zoom)change(before=>zoomCanvasCamera(before,wheelZoomFactor(event.deltaY,event.deltaMode,node.clientHeight)));
   else{
    const unit=event.deltaMode===1?16:event.deltaMode===2?node.clientHeight:1;
    const horizontal=event.shiftKey&&!event.deltaX;
    pan(-(horizontal?event.deltaY:event.deltaX)*unit,horizontal?0:-event.deltaY*unit);
   }
  }
  function down(event){
   if(!node.contains(event.target))return;
   suppressClick=false;
   const {canPan,blocked,dragByDefault}=latest.current;
   const primary=event.button===0&&(space||dragByDefault);
   if(!drag&&!held.current&&canPan&&!blocked&&(primary||event.button===1)&&!isControl(event.target)){
    event.preventDefault();event.stopPropagation();node.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};node.dataset.panning='';suppressClick=true;
   }
   held.current=true;
  }
  function move(event){
   if(event.pointerId!==drag?.id)return;
   event.preventDefault();event.stopPropagation();
   pan(event.clientX-drag.x,event.clientY-drag.y);drag.x=event.clientX;drag.y=event.clientY;
  }
  function end(event){
   if(drag&&event.pointerId!==drag.id)return;
   held.current=false;
   if(!drag)return;
   event.stopPropagation();drag=null;delete node.dataset.panning;
   if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);
  }
  function click(event){if(suppressClick&&node.contains(event.target)){suppressClick=false;event.preventDefault();event.stopPropagation();}}
  function key(event){
   if(event.code!=='Space')return;
   if(event.type==='keyup'){space=false;delete node.dataset.spacePan;return;}
   if(latest.current.blocked||!latest.current.canPan||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   space=true;node.dataset.spacePan='';if(node.matches(':hover'))event.preventDefault();
  }
  function blur(event){
   if(event&&event.target!==window)return;
   if(drag&&node.hasPointerCapture(drag.id))node.releasePointerCapture(drag.id);
   drag=null;space=false;held.current=false;delete node.dataset.panning;delete node.dataset.spacePan;
  }
  node.addEventListener('wheel',wheel,{passive:false});
  const listeners={pointerdown:down,pointermove:move,pointerup:end,pointercancel:end,lostpointercapture:end,click,auxclick:click,keydown:key,keyup:key,blur};
  for(const [type,fn] of Object.entries(listeners))window.addEventListener(type,fn,true);
  return()=>{for(const [type,fn] of Object.entries(listeners))window.removeEventListener(type,fn,true);node.removeEventListener('wheel',wheel);blur();};
 },[area,projectId,change]);
 return {...camera,canPan,step,reset:()=>{if(!blocked&&!held.current)change(()=>home);}};
}
