import {useState} from 'react';
import {Modal} from '../Modal.jsx';
import {ArrowCounterClockwise,Trash,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {OptimizeIcon} from './OptimizeIcon.jsx';

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
 const steps=[['calculate','裁剪'],['save','保存'],['render','预览']],index=steps.findIndex(([key])=>key===phase);
 return <Modal label="一键优化进度" className="optimization-dialog" onCancel={()=>{if(finished)onClose();}}>
  <div className="optimization-heading"><div className={`stitch-dialog-icon ${state.phase==='error'?'danger':''}`}><Icon size={27}/></div><div><h2>{labels[state.phase]}</h2><p aria-live="polite">{state.message||'正在处理当前画布'}</p></div></div>
  {state.phase!=='error'&&<div className={`optimization-progress ${state.phase==='done'?'done':''}`} role="progressbar" aria-label="一键优化进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.phase==='done'?100:undefined} aria-valuetext={labels[state.phase]}><span className="optimization-progress-fill"/></div>}
  <div className="optimization-steps" aria-hidden>{steps.map(([key,label],n)=>{const status=state.phase==='done'||n<index?'complete':n===index?(state.phase==='error'?'failed':'active'):'';return <span key={key} className={status}><i>{status==='complete'?<CheckCircle size={13} weight="fill"/>:<span/>}</i>{label}</span>;})}</div>
  <div className="stitch-dialog-actions"><button className={state.phase==='done'?'dialog-confirm':'dialog-cancel optimization-dismiss'} disabled={!finished} onClick={onClose}>{state.phase==='done'?'完成':'关闭'}</button></div>
 </Modal>;
}
