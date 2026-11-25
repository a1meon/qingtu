import {useEffect,useRef,useState} from 'react';
import {ArrowCounterClockwise,CaretDown} from '@phosphor-icons/react';
import {TooltipButton} from '../TooltipButton.jsx';
import {OptimizeIcon} from './OptimizeIcon.jsx';
import {optimizationAvailability} from '../../engine/stitch-optimize.mjs';
import {OptimizationSettings} from './OptimizationSettings.jsx';

export function CanvasTools({project,busy,onReset,onOptimize,onSettings}){
 const [open,setOpen]=useState(false),[invalid,setInvalid]=useState(''),root=useRef(),toggle=useRef();
 const close=()=>{setOpen(false);setInvalid('');};
 useEffect(()=>{close();},[project?.id,busy]);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(!root.current.contains(event.target))close();},escape=event=>{if(event.key==='Escape'){event.stopPropagation();close();toggle.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 const optimization=optimizationAvailability(project);
 return <div className="canvas-actions" role="group" aria-label="画布工具">
  <TooltipButton label="重置画布" placement="left" className="raised-icon-button canvas-reset" disabled={busy||!project?.images.length} onClick={onReset}><ArrowCounterClockwise size={19}/></TooltipButton>
  <div className="canvas-optimize-group" ref={root}>
   <button className="canvas-optimize" aria-label="四视优化" title={["四视优化",optimization.hint].filter(Boolean).join(" · ")} disabled={busy||!optimization.enabled||!!invalid} onClick={()=>{close();onOptimize();}}><span className="optimizer-glyph"><OptimizeIcon size={20}/></span><span className="optimizer-label">四视优化</span></button>
   <button className="canvas-optimize-settings" aria-label="设置优化裁剪" title="优化裁剪设置" aria-expanded={open} disabled={busy||!project} ref={toggle} onClick={()=>{if(open)close();else setOpen(true);}}><CaretDown size={14} weight="bold"/></button>
   {open&&<OptimizationSettings key={project.id+':'+project.images.map(image=>image.id).join(',')} value={project.optimization} images={project.images} hint={!optimization.enabled&&optimization.hint!=='当前裁剪已优化'?optimization.hint:null} onChange={onSettings} onValidityChange={setInvalid}/>}
  </div>
 </div>;
}
