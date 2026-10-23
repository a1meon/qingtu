import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Plus,Trash,PencilSimple,DownloadSimple} from '@phosphor-icons/react';
import {CanvasCardName} from './stitch/CanvasCardName.jsx';
import {ContextMenu} from './stitch/ContextMenu.jsx';
import {blockPreviewDrag} from './file-drop.js';

export const CompressionQueue=forwardRef(function CompressionQueue({items,currentId,selectedIds,selectionExplicit,onOpen,onAdd,onSelect,onSelectAll,onExport,onRename,onDelete,statuses,disabled,active},ref){
 const [renaming,setRenaming]=useState(null),[context,setContext]=useState(null),editor=useRef();
 const chosen=new Set(selectedIds),all=items.length>0&&chosen.size===items.length,mixed=chosen.size>0&&!all;
 const flush=()=>editor.current?.flush()||Promise.resolve();
 useImperativeHandle(ref,()=>({flush}),[]);
 useEffect(()=>{setContext(null);},[active,disabled]);
 useEffect(()=>{if(!active)flush().catch(()=>{});},[active]);
 async function startRename(id){if(disabled)return;try{await flush();if(await onOpen(id)===false)return;setRenaming(id);}catch{}}
 const endRename=id=>setRenaming(current=>current===id?null:current);
 const deleteIds=context&&selectionExplicit&&chosen.has(context.id)?selectedIds:[context?.id];
 return <div className="queue-region compression-queue" onDragStart={blockPreviewDrag}>
  <div className="queue-toolbar"><span>图片<span className="queue-count">{items.length}</span></span><div className="canvas-queue-actions">{items.length>0&&<label className="canvas-export-all"><input type="checkbox" aria-label="全选导出图片" ref={node=>{if(node)node.indeterminate=mixed;}} checked={all} disabled={disabled} onChange={e=>onSelectAll(e.target.checked)}/><span>全选</span></label>}<button className="icon-button queue-clear" aria-label={all?'清空图片':'删除所选图片'} title="删除所选图片" disabled={disabled||!chosen.size} onClick={()=>onDelete(selectedIds)}><Trash size={22} weight="bold"/></button></div></div>
  <div className="filmstrip" aria-label="图片队列">
   {items.map(file=><div className={`film-item compression-card ${file.id===currentId?'selected':''}`} key={file.id} onContextMenu={e=>{if(e.target.closest('input'))return;e.preventDefault();if(!disabled)setContext({id:file.id,anchor:{x:e.clientX,y:e.clientY}});}}>
    <button className="film-select" disabled={disabled} draggable={false} aria-label={`预览 ${file.name}`} aria-pressed={file.id===currentId} onClick={()=>onOpen(file.id)}><img src={file.preview} alt={file.name} draggable={false}/></button>
    <label className="canvas-export-select" title="选择导出"><input type="checkbox" aria-label={`选择导出 ${file.name}`} checked={chosen.has(file.id)} disabled={disabled} onChange={e=>onSelect(file.id,e.target.checked)}/></label>
    <CanvasCardName ref={renaming===file.id?editor:null} project={file} editing={renaming===file.id} disabled={disabled} nameLabel="图片名称" maxLength={200} onStart={startRename} onRename={onRename} onEnd={endRename}/>
    {statuses[file.id]&&<span className={`file-status ${statuses[file.id].type}`} title={statuses[file.id].text}>{statuses[file.id].type==='busy'?'处理中':statuses[file.id].text}</span>}
   </div>)}
   <div className="film-item add-item"><button className="add-tile" aria-label="添加图片" onClick={onAdd} disabled={disabled}><Plus size={38} weight="bold"/></button><span className="filename">添加图片</span></div>
  </div>
  {context&&active&&!disabled&&<ContextMenu label="图片操作" anchor={context.anchor} onClose={()=>setContext(null)} items={[
   {label:'导出该图像',icon:DownloadSimple,action:()=>onExport(context.id)},
   {label:'重命名',icon:PencilSimple,action:()=>startRename(context.id)},
   {label:'删除',icon:Trash,danger:true,action:()=>onDelete(deleteIds)}
  ]}/>}
 </div>;
});
