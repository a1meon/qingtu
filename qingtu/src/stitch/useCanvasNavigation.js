import {useCallback,useEffect,useRef,useState} from 'react';
import {applyCanvasCamera,stepCanvasZoom,wheelZoomFactor,zoomCanvasCamera} from './canvas-viewport.js';

// 100% is the fitted view. Magnification changes only around its fixed centre.
export function useCanvasNavigation({area,projectId,fit,blocked}){
 const [stored,setStored]=useState(()=>({id:projectId,zoom:1})),latest=useRef(),held=useRef(false);
 const camera={zoom:stored.id===projectId?stored.zoom:1};
 latest.current={projectId,blocked};
 const changeZoom=useCallback(update=>{
  const {projectId,blocked}=latest.current;
  if(blocked||held.current)return;
  setStored(previous=>{
   const zoom=update(previous.id===projectId?previous.zoom:1);
   return previous.id===projectId&&previous.zoom===zoom?previous:{id:projectId,zoom};
  });
 },[]);
 useEffect(()=>{
  const node=area.current;
  const down=event=>{if(node.contains(event.target)&&!event.target.closest('.canvas-viewport-controls,.inline-image-editor,.inline-image-tools'))held.current=true;},up=()=>{held.current=false;};
  const wheel=event=>{
   if(!event.ctrlKey&&!event.metaKey)return;
   event.preventDefault();
   const factor=wheelZoomFactor(event.deltaY,event.deltaMode,node.clientHeight);
   changeZoom(zoom=>zoomCanvasCamera({zoom},factor).zoom);
  };
  node.addEventListener('wheel',wheel,{passive:false});document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);window.addEventListener('blur',up);
  return()=>{node.removeEventListener('wheel',wheel);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);window.removeEventListener('blur',up);};
 },[area,changeZoom]);
 return {view:applyCanvasCamera(fit,camera),zoom:camera.zoom,step:direction=>changeZoom(zoom=>stepCanvasZoom(zoom,direction)),reset:()=>changeZoom(()=>1)};
}
