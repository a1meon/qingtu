import {Fragment,useEffect,useId,useState} from 'react';
import {ClockCounterClockwise,FolderOpen} from '@phosphor-icons/react';
import {prepareBrowserFolder} from './browser-output-folder.js';
import {api,nativeFolders} from './api.js';
import {ExportHistory} from './ExportHistory.jsx';

export function useOutputFolder(scope,onError){
 const [selected,setSelected]=useState(null);
 useEffect(()=>{
  let active=true;
  api.outputFolder(scope).then(folder=>{if(active)setSelected(current=>current??folder);})
   .catch(error=>console.warn('读取输出目录失败',error.message));
  return ()=>{active=false;};
 },[scope]);
 async function choose(){
  try{const folder=await api.chooseFolder(scope,selected);if(folder)setSelected(folder);return folder;}
  catch(error){onError(error.message);return null;}
 }
 async function reveal(){
  try{await api.revealFolder(scope);}catch(error){onError(error.message);}
 }
 async function prepare(){
  if(nativeFolders)return true;
  const destination=await prepareBrowserFolder(scope,selected||await api.outputFolder(scope));
  if(destination)setSelected(destination);
  return destination;
 }
 return {scope,selected,choose,prepare,save:(token,destination)=>api.save(token,scope,destination),reveal};
}

export function OutputFolder({folder,disabled}){
 const id=useId(),[showHistory,setShowHistory]=useState(false);
 const [pathDismissed,setPathDismissed]=useState(false);
 const path=folder.selected?.path;
 const parts=path?.match(/[^/\\]+[/\\]?|[/\\]+/g)??[];
 const value=folder.selected?.path||folder.selected?.name||'';
 return <>
  <div className="output-folder-heading">
   <label htmlFor={id}>输出文件夹</label>
   <button type="button" className="history-trigger" aria-haspopup="dialog" onClick={()=>setShowHistory(true)} disabled={disabled}><ClockCounterClockwise size={15} aria-hidden/>导出历史</button>
  </div>
  <div className="output-folder-row">
   <div className="folder-path" onPointerEnter={()=>setPathDismissed(false)} onFocus={()=>setPathDismissed(false)}>
    <input type="text" id={id} className="folder-control" readOnly value={value} placeholder="读取输出目录…"
     onClick={()=>setPathDismissed(false)} onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();setPathDismissed(true);}
     }}/>
    {path&&!pathDismissed&&<span className="folder-path-popover" aria-hidden="true">
     <span className="folder-full-path">{parts.map((part,index)=>index===parts.length-1
      ?<strong key={index}>{part}</strong>
      :<Fragment key={index}>{part}<wbr/></Fragment>)}{folder.selected?.needsPermission&&<small>首次导出时，请选择系统的「图片」文件夹。</small>}</span>
    </span>}
   </div>
   <button type="button" className="raised-icon-button folder-picker" disabled={disabled} onClick={folder.choose} aria-label="选择导出目录" title="选择导出目录"><FolderOpen size={18} weight="bold" aria-hidden/><span>选择目录</span></button>
  </div>
  {showHistory&&<ExportHistory scope={folder.scope} onClose={()=>setShowHistory(false)}/>}
 </>;
}
