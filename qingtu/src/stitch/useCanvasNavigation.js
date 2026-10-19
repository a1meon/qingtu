import {useEffect,useRef,useState} from 'react';
import {applyCanvasCamera,zoomCanvasCamera} from './canvas-viewport.js';

// 100% is the fitted view. Magnification changes only around its fixed centre.
export function useCanvasNavigation({area,projectId,fit,blocked}){
 const [stored,setStored]=useState(()=>({id:projectId,zoom:1})),latest=useRef(),held=useRef(false);
 const camera={zoom:stored.id===projectId?stored.zoom:1};latest.current={camera,projectId,blocked};
 function zoomBy(factor){if(latest.current.blocked||held.current)return;const next=zoomCanvasCamera(latest.current.camera,factor);latest.current.camera=next;setStored({id:latest.current.projectId,zoom:next.zoom});}
 const zoom=useRef();zoom.current=zoomBy;
 useEffect(()=>{
  const node=area.current;
  const down=event=>{if(node.contains(event.target)&&!event.target.closest('.canvas-viewport-controls,.inline-image-editor,.inline-image-tools'))held.current=true;},up=()=>{held.current=false;};
  const wheel=event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();if(latest.current.blocked||held.current)return;const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?node.clientHeight:1);zoom.current(Math.exp(-Math.max(-400,Math.min(400,delta))*.002));};
  node.addEventListener('wheel',wheel,{passive:false});document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);window.addEventListener('blur',up);
  return()=>{node.removeEventListener('wheel',wheel);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);window.removeEventListener('blur',up);};
 },[]);
 return {view:applyCanvasCamera(fit,camera),zoom:camera.zoom,zoomBy,reset:()=>{if(!latest.current.blocked&&!held.current){latest.current.camera={zoom:1};setStored({id:latest.current.projectId,zoom:1});}}};
}
