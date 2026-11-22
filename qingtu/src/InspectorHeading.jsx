import {ArrowCounterClockwise,SidebarSimple} from '@phosphor-icons/react';
import {TooltipButton} from './TooltipButton.jsx';

export function InspectorToggle({panelId,expanded,setOpen}){
 const action=expanded?'collapse':'expand';
 function toggle(event){
  setOpen(!expanded);
  if(event.detail===0&&event.currentTarget===document.activeElement){
   const nextId=panelId+(expanded?'-expand':'-collapse');
   requestAnimationFrame(()=>document.getElementById(nextId)?.focus());
  }
 }
 return <TooltipButton id={panelId+'-'+action} label={expanded?'收起导出设置':'展开导出设置'} placement="left" className="icon-button panel-toggle"
  aria-expanded={expanded} aria-controls={panelId} onClick={toggle}><SidebarSimple size={23} weight="bold" aria-hidden/></TooltipButton>;
}

export function InspectorHeading({title,panelId,setOpen,onReset,resetDisabled}){
 return <div className="inspector-heading">
  <h1>{title}</h1>
  <div className="inspector-actions">
   {onReset&&<TooltipButton label="重置设置" placement="left" className="icon-button" onClick={onReset} disabled={resetDisabled}><ArrowCounterClockwise size={23} weight="bold" aria-hidden/></TooltipButton>}
   <InspectorToggle panelId={panelId} expanded={true} setOpen={setOpen}/>
  </div>
 </div>;
}
