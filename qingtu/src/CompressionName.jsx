import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {addFlushHandler} from './lifecycle.js';

export const CompressionName=forwardRef(function CompressionName({file,disabled,active,onRename},ref){
 const [draft,setDraft]=useState(file.name),[pending,setPending]=useState(false),[error,setError]=useState('');
 const value=useRef(file.name),dirty=useRef(false),task=useRef(Promise.resolve()),commitRef=useRef();
 useEffect(()=>{if(!dirty.current&&!pending){value.current=file.name;setDraft(file.name);}},[file.name,pending]);
 function commit(){
  if(!dirty.current)return task.current;
  const name=value.current;dirty.current=false;setPending(true);setError('');
  const next=task.current.catch(()=>{}).then(()=>onRename(file.id,name)).catch(e=>{dirty.current=true;setError(e.message);throw e;}).finally(()=>setPending(false));task.current=next;return next;
 }
 commitRef.current=commit;
 useImperativeHandle(ref,()=>({flush:()=>commitRef.current()}),[]);
 useEffect(()=>addFlushHandler(()=>commitRef.current()),[]);
 useEffect(()=>{if(!active)commitRef.current().catch(()=>{});},[active]);
 return <input className="file-toolbar-name compression-name" aria-label="图像名称" title={error||'Enter 保存，Esc 取消'} maxLength={200} value={draft} disabled={disabled||pending} aria-invalid={!!error} onChange={event=>{value.current=event.target.value;dirty.current=true;setDraft(value.current);setError('');}} onBlur={()=>commit().catch(()=>{})} onKeyDown={event=>{
  if(event.key==='Enter'){event.preventDefault();commit().catch(()=>{});}
  if(event.key==='Escape'){event.preventDefault();dirty.current=false;value.current=file.name;setDraft(file.name);setError('');task.current=Promise.resolve();}
 }}/>;
});
