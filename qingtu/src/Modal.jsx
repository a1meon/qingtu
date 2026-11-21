import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';

export function Modal({children,label,onCancel,onKeyDown,className=''}){
 const dialog=useRef();
 useEffect(()=>{const target=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();if(target?.isConnected)target.focus();};},[]);
 return createPortal(<dialog ref={dialog} className={`stitch-dialog ${className}`} aria-label={label} onKeyDown={onKeyDown} onCancel={event=>{event.preventDefault();onCancel?.();}}>{children}</dialog>,document.body);
}
