import {useEffect,useRef,useState} from 'react';
import {repository,newProject} from './repository.js';
import {api} from '../api.js';
import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {explicitFormat} from '../export-format.js';
import {knownImportOrder} from '../../engine/stitch-reset.mjs';
import {importCanvasImages} from '../../engine/canvas-import.mjs';
import {rememberCanvasLayout} from '../../engine/canvas-layout-state.mjs';

export function useProjects(){
 const [projects,setProjects]=useState([]),[project,setProject]=useState(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[loading,setLoading]=useState(true);
 const current=useRef(null),pending=useRef(Promise.resolve()),failure=useRef(null),loadRevision=useRef(0);
 const revisions=useRef(new Map()),retryLoad=useRef(null);
 const flush=async()=>{await pending.current;if(failure.current)throw failure.current;};
 useEffect(()=>addFlushHandler(flush),[]);
 const persist=value=>{
  setSaving(true);setSaveError('');
  const task=pending.current.catch(()=>{}).then(async()=>{
   const result=await repository.save(value,revisions.current.get(value.id)??null);
   revisions.current.set(value.id,result.revision);
   failure.current=null;
   setProjects(old=>[{id:value.id,name:value.name,count:value.images.length,revision:result.revision,updatedAt:result.updatedAt,thumbnail:result.thumbnail},...old.filter(p=>p.id!==value.id)]);
   setSaveError('');return result;
  }).catch(error=>{failure.current=error;setSaveError(error.message);throw error;});
  pending.current=task;
  task.catch(()=>{}).finally(()=>{if(pending.current===task)setSaving(false);});
  return task;
 };
 const update=change=>{
  const previous=current.current;if(!previous)return;
  const changed=typeof change==='function'?change(previous):{...previous,...change};
  const next=rememberCanvasLayout(changed);
  try{const layout=calculateLayout(next);if(next.canvasMode!=='fixed')next.canvas={width:layout.width,height:layout.height};next.crops=Object.fromEntries(layout.rects.map(r=>[r.id,r.crop]));}catch{if(next.canvasMode!=='fixed')next.canvas=null;next.crops={};}
  current.current=next;setProject(next);return persist(next);
 };
 const open=async id=>{
  const revision=++loadRevision.current;setLoading(true);
  try{
   await flush();retryLoad.current=id;const value=await repository.load(id),format=explicitFormat(value.export?.format),formatChanged=value.export?.format!==format;
   const initialOrder=knownImportOrder(value),orderChanged=value.initialOrder===undefined&&initialOrder!==undefined;
   const retained=new Map();
   const ready=await repository.prepare({...value,...(initialOrder?{initialOrder}:{}),export:{...value.export,format}},{retain:retained});
   if(revision!==loadRevision.current)return;
   if(current.current&&current.current.id!==id)await api.stitchRelease(current.current.id);
   if(revision!==loadRevision.current)return;
   repository.setOriginals(retained);setProjects(old=>old.map(p=>p.id===id?{...p,name:value.name,revision:value.revision??0}:p));revisions.current.set(id,value.revision??0);retryLoad.current=null;current.current=ready;setProject(ready);
   setSaveError('');
   if(value.recovered)setSaveError('已恢复上次完整保存；请检查编辑状态后重试保存');
   else if(value.canvasMode!=='fixed'||value.heightLocked!==ready.heightLocked||formatChanged||orderChanged||!value.thumbnail&&value.images.length)persist(ready);
  }catch(error){if(revision===loadRevision.current)setSaveError(error.message);throw error;}finally{if(revision===loadRevision.current)setLoading(false);}
 };
 const leaveProject=async()=>{
  await flush();
  if(current.current)await api.stitchRelease(current.current.id);
  repository.setOriginals();current.current=null;setProject(null);retryLoad.current=null;
 };
 const create=async(images=[],originals)=>{
  await flush();
  const value=importCanvasImages(newProject(),images),filename=images[0]?.name;
  const extension=filename?.lastIndexOf('.');
  value.name=filename?(extension>0?filename.slice(0,extension):filename):`图像 ${projects.length+1}`;
  if(current.current)await api.stitchRelease(current.current.id);
  repository.setOriginals(originals);retryLoad.current=null;current.current=value;setProject(value);await persist(value);return value;
 };
 const remove=async id=>{
  await flush();const item=projects.find(p=>p.id===id);if(!item)return;
  await repository.remove([{...item,revision:revisions.current.get(id)??item.revision}]);await api.stitchRelease(id);
  const rest=await repository.list();setProjects(rest);
  if(current.current?.id===id){repository.setOriginals();current.current=null;setProject(null);if(rest.length)await open(rest[0].id);}
 };
 const clear=async()=>{
  await flush();++loadRevision.current;setLoading(true);
  try{
   const selection=projects.map(item=>({...item,revision:revisions.current.get(item.id)??item.revision}));
   await repository.remove(selection);for(const {id} of selection)await api.stitchRelease(id);
   repository.setOriginals();current.current=null;setProject(null);const rest=await repository.list();setProjects(rest);setSaveError('');
   if(rest.length)await open(rest[0].id);
  }catch(error){
   const rest=await repository.list();setProjects(rest);
   if(rest.length)await open(rest.find(p=>p.id===current.current?.id)?.id||rest[0].id);
   throw error;
  }finally{setLoading(false);}
 };
 useEffect(()=>{
  let live=true;
  repository.list().then(async list=>{if(!live)return;setProjects(list);if(list.length)await open(list[0].id);}).catch(e=>setSaveError(e.message)).finally(()=>setLoading(false));
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  const beforeUnload=e=>{if(saving||failure.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);
 },[saving]);
 const retry=async()=>{
  if(failure.current?.code==='PROJECT_CONFLICT'){
   setLoading(true);
   try{
    await pending.current.catch(()=>{});
    const copy={...current.current,id:crypto.randomUUID(),name:`${current.current.name}（副本）`};
    // Until commit succeeds the original in-memory draft owns the editor.
    const result=await repository.save(copy,null);revisions.current.set(copy.id,result.revision);
    current.current=copy;setProject(copy);failure.current=null;pending.current=Promise.resolve();setSaveError('');
    setProjects(await repository.list());
   }catch(error){setSaveError(error.message);}finally{setLoading(false);}
  }else if(retryLoad.current){await open(retryLoad.current).catch(()=>{});}
  else if(current.current){await persist(current.current).catch(()=>{});}
  else{try{const list=await repository.list();setProjects(list);if(list.length)await open(list[0].id);else setSaveError('');}catch(error){setSaveError(error.message);}}
 };
 return {projects,project,update,open,leaveProject,create,remove,clear,loading,saving,saveError,flush,getCurrent:()=>current.current,retry,conflict:failure.current?.code==='PROJECT_CONFLICT'};
}
