import {ArrowCounterClockwise,SidebarSimple} from '@phosphor-icons/react';
import {TooltipButton} from './TooltipButton.jsx';

export function InspectorToggle({panelId,expanded,setOpen,settingsName='导出设置'}){
 const action=expanded?'collapse':'expand';
 function toggle(event){
  setOpen(!expanded);
  if(event.detail===0&&event.currentTarget===document.activeElement){
   const nextId=panelId+(expanded?'-expand':'-collapse');
   requestAnimationFrame(()=>document.getElementById(nextId)?.focus());
  }
 }
 return <TooltipButton id={panelId+'-'+action} label={(expanded?'收起':'展开')+settingsName} placement="left" className="icon-button panel-toggle"
  aria-expanded={expanded} aria-controls={panelId} onClick={toggle}><SidebarSimple size={23} weight="bold" aria-hidden/></TooltipButton>;
}

export function InspectorHeading({title,panelId,setOpen,onReset,resetDisabled,settingsName}){
 return <div className="inspector-heading">
  <h1>{title}</h1>
  <div className="inspector-actions">
   {onReset&&<TooltipButton label="重置设置" placement="left" className="icon-button" onClick={onReset} disabled={resetDisabled}><ArrowCounterClockwise size={23} weight="bold" aria-hidden/></TooltipButton>}
   <InspectorToggle panelId={panelId} expanded={true} setOpen={setOpen} settingsName={settingsName}/>
  </div>
 </div>;
}
