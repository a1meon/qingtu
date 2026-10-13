import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowCounterClockwise,Trash,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {OptimizeIcon} from './OptimizeIcon.jsx';

function Modal({children,label,onCancel}){
 const dialog=useRef();
 useEffect(()=>{const target=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();if(target?.isConnected)target.focus();};},[]);
 return createPortal(<dialog ref={dialog} className="stitch-dialog" aria-label={label} onCancel={event=>{event.preventDefault();onCancel?.();}}>{children}</dialog>,document.body);
}
export function ConfirmDialog({request,onCancel,onConfirm}){
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 const Icon=request.danger?Trash:ArrowCounterClockwise;
 async function confirm(){setWorking(true);setError('');try{await onConfirm();}catch(e){setError(e.message);setWorking(false);}}
 return <Modal label={request.title} onCancel={()=>{if(!working)onCancel();}}><div className={`stitch-dialog-icon ${request.danger?'danger':''}`}><Icon size={30}/></div><h2>{request.title}</h2><p>{request.description}</p>{error&&<p className="dialog-error" role="alert">{error}</p>}<div className="stitch-dialog-actions"><button className="dialog-cancel" disabled={working} onClick={onCancel}>取消</button><button className={`dialog-confirm ${request.danger?'danger':''}`} disabled={working} onClick={confirm}>{working?'处理中…':request.label}</button></div></Modal>;
}
export function OptimizeDialog({state,onClose}){
 const finished=state.phase==='done'||state.phase==='error',Icon=state.phase==='done'?CheckCircle:state.phase==='error'?WarningCircle:OptimizeIcon;
 const phase=state.phase==='error'?state.failedAt:state.phase;
 const labels={prepare:'准备优化',calculate:'计算裁剪',save:'保存画布',render:'生成预览',done:'优化完成',error:'优化未完成'};
 return <Modal label="一键优化进度" onCancel={()=>{if(finished)onClose();}}><div className={`stitch-dialog-icon ${state.phase==='error'?'danger':''}`}><Icon size={32}/></div><h2>{labels[state.phase]}</h2><p aria-live="polite">{state.message||'正在处理当前画布'}</p>{state.phase!=='error'&&<progress aria-label="一键优化进度" max="1" value={state.phase==='done'?1:undefined}/>}<div className="optimization-steps" aria-hidden><span className={['save','render','done'].includes(phase)?'complete':''}>裁剪</span><span className={['render','done'].includes(phase)?'complete':''}>保存</span><span className={state.phase==='done'?'complete':''}>预览</span></div>{finished&&<div className="stitch-dialog-actions"><button className="dialog-confirm" onClick={onClose}>{state.phase==='done'?'完成':'关闭'}</button></div>}</Modal>;
}
