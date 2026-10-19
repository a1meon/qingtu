import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {addFlushHandler} from '../lifecycle.js';
import {canvasName} from './names.js';

export const CanvasCardName=forwardRef(function CanvasCardName({project,editing,disabled,onStart,onRename,onEnd,nameLabel='画布名称',maxLength=80},ref){
 const [draft,setDraft]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const input=useRef(),value=useRef(''),done=useRef(false),task=useRef(Promise.resolve()),commitRef=useRef();
 useLayoutEffect(()=>{if(editing){value.current=canvasName(project.name);setDraft(value.current);setError('');done.current=false;input.current.focus();input.current.select();}},[editing,project.id]);
 function commit(){
  if(!editing)return Promise.resolve();
  if(done.current)return task.current;
  done.current=true;
  if(value.current===project.name){task.current=Promise.resolve();onEnd(project.id);return task.current;}
  setPending(true);setError('');
  task.current=Promise.resolve().then(()=>onRename(project.id,value.current)).then(()=>onEnd(project.id)).catch(e=>{done.current=false;setError(e.message);throw e;}).finally(()=>setPending(false));
  return task.current;
 }
 commitRef.current=commit;
 useEffect(()=>addFlushHandler(()=>commitRef.current()),[]);
 useImperativeHandle(ref,()=>({flush:()=>commitRef.current()}),[]);
 if(editing)return <span className="filename canvas-name-edit"><span className="canvas-name-measure" aria-hidden>{draft||'\u200b'}</span><input ref={input} className="canvas-name-input" aria-label={nameLabel} maxLength={maxLength} value={draft} disabled={disabled||pending} aria-invalid={!!error} title={error||'Enter 保存，Esc 取消'} onChange={event=>{value.current=event.target.value;setDraft(value.current);}} onBlur={()=>commit().catch(()=>{})} onKeyDown={event=>{
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit().catch(()=>{});}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();done.current=true;task.current=Promise.resolve();onEnd(project.id);}
 }}/></span>;
 return <button className="filename canvas-name" aria-label={`重命名 ${canvasName(project.name)}`} title={project.name} disabled={disabled} onDoubleClick={()=>onStart(project.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key==='F2'){event.preventDefault();onStart(project.id);}}}>{canvasName(project.name)}</button>;
});
