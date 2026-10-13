import {useEffect,useId,useRef,useState} from 'react';

// A focusable reserved tool still explains itself without opening a fake page.
export function TooltipButton({label,hint=label,children,className='',placement='right',unavailable=false,onClick,...props}){
 const [open,setOpen]=useState(false),timer=useRef(),id=useId();
 const hide=()=>{clearTimeout(timer.current);setOpen(false);};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <span className={`tooltip-anchor tooltip-${placement}`} onMouseEnter={()=>{clearTimeout(timer.current);timer.current=setTimeout(()=>setOpen(true),220);}} onMouseLeave={hide}>
  <button {...props} className={className} aria-label={label} aria-disabled={unavailable||undefined} aria-describedby={open?id:undefined} onFocus={()=>{clearTimeout(timer.current);setOpen(true);}} onBlur={hide} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();hide();}}} onClick={event=>{if(unavailable){clearTimeout(timer.current);setOpen(true);}else{hide();onClick?.(event);}}}>{children}</button>
  {open&&<span className="tool-tooltip" role="tooltip" id={id}>{hint}</span>}
 </span>;
}
