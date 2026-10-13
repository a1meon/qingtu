import {useEffect,useRef,useState} from 'react';
import {repository,newProject} from './repository.js';
import {api} from '../api.js';
import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {explicitFormat} from '../export-format.js';
import {knownImportOrder} from '../../engine/stitch-reset.mjs';

export function useProjects(){
 const [projects,setProjects]=useState([]),[project,setProject]=useState(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[loading,setLoading]=useState(true);
 const current=useRef(null),pending=useRef(Promise.resolve()),failure=useRef(null),loadRevision=useRef(0);
 const flush=async()=>{await pending.current;if(failure.current)throw failure.current;};
 useEffect(()=>addFlushHandler(flush),[]);
 const persist=value=>{
  setSaving(true);setSaveError('');
  const task=pending.current.catch(()=>{}).then(()=>repository.save(value));pending.current=task;
  task.then(result=>{
   failure.current=null;
   setProjects(old=>[{id:value.id,name:value.name,count:value.images.length,updatedAt:result.updatedAt,thumbnail:result.thumbnail},...old.filter(p=>p.id!==value.id)]);
  }).catch(error=>{failure.current=error;setSaveError(error.message);}).finally(()=>{if(pending.current===task)setSaving(false);});
  return task;
 };
 const update=change=>{
  const previous=current.current;if(!previous)return;
  const next=typeof change==='function'?change(previous):{...previous,...change};
  try{const layout=calculateLayout(next);next.canvas={width:layout.width,height:layout.height};next.crops=Object.fromEntries(layout.rects.map(r=>[r.id,r.crop]));}catch{next.canvas=null;next.crops={};}
  current.current=next;setProject(next);return persist(next);
 };
 const open=async id=>{
  const revision=++loadRevision.current;setLoading(true);
  try{
   await flush();const value=await repository.load(id),format=explicitFormat(value.export?.format),formatChanged=value.export?.format!==format;
   const initialOrder=knownImportOrder(value),orderChanged=value.initialOrder===undefined&&initialOrder!==undefined;
   const ready=await repository.prepare({...value,...(initialOrder?{initialOrder}:{}),export:{...value.export,format}});
   if(revision!==loadRevision.current)return;
   if(current.current&&current.current.id!==id)await api.stitchRelease(current.current.id);
   current.current=ready;setProject(ready);
   setSaveError('');
   if(value.recovered)setSaveError('已恢复上次完整保存；请检查编辑状态后重试保存');
   else if(formatChanged||orderChanged||!value.thumbnail&&value.images.length)persist(ready);
  }catch(error){setSaveError(error.message);throw error;}finally{if(revision===loadRevision.current)setLoading(false);}
 };
 const create=async()=>{
  await flush();const value=newProject();value.name=`图像 ${projects.length+1}`;
  if(current.current)await api.stitchRelease(current.current.id);
  current.current=value;setProject(value);persist(value);return value;
 };
 const remove=async id=>{
  await flush();await repository.remove(id);await api.stitchRelease(id);
  const rest=projects.filter(p=>p.id!==id);setProjects(rest);
  if(current.current?.id===id){current.current=null;setProject(null);if(rest.length)await open(rest[0].id);else await create();}
 };
 const clear=async()=>{
  await flush();++loadRevision.current;setLoading(true);
  try{
   const list=await repository.list();
   for(const value of list){await repository.remove(value.id);await api.stitchRelease(value.id);}
   const fresh=newProject();fresh.name='图像 1';current.current=fresh;setProject(fresh);setProjects([]);await persist(fresh);
  }catch(error){
   const rest=await repository.list();setProjects(rest);
   if(rest.length)await open(rest.find(p=>p.id===current.current?.id)?.id||rest[0].id);
   throw error;
  }finally{setLoading(false);}
 };
 useEffect(()=>{
  let live=true;
  repository.list().then(async list=>{if(!live)return;setProjects(list);if(list.length)await open(list[0].id);else await create();}).catch(e=>setSaveError(e.message)).finally(()=>setLoading(false));
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  const beforeUnload=e=>{if(saving||failure.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);
 },[saving]);
 return {projects,project,update,open,create,remove,clear,loading,saving,saveError,flush,getCurrent:()=>current.current,retry:()=>{if(current.current)persist(current.current);}};
}
