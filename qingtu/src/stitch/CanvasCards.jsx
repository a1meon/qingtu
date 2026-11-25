import {Plus,Trash,ImageSquare} from '@phosphor-icons/react';
import {canvasName} from './names.js';
import {blockPreviewDrag} from '../file-drop.js';
import {CanvasCardName} from './CanvasCardName.jsx';

export function CanvasCards({projects,currentId,onOpen,onCreate,onClear,onContext,disabled,exportableIds,exportIds,onSelectExport,onSelectAll,renamingId,renameInput,onRenameStart,onRename,onRenameEnd}){
 const eligible=new Set(exportableIds),chosen=new Set(exportIds),all=eligible.size>0&&chosen.size===eligible.size,mixed=chosen.size>0&&!all;
 return <div className="queue-region canvas-cards-region" onDragStart={blockPreviewDrag}>
  <div className="queue-toolbar"><span>图像<span className="queue-count">{projects.length}</span></span>{projects.length>0&&<div className="canvas-queue-actions">{eligible.size>0&&<label className="canvas-export-all"><input type="checkbox" aria-label="全选导出图像" ref={node=>{if(node)node.indeterminate=mixed;}} checked={all} disabled={disabled} onChange={event=>onSelectAll(event.target.checked)}/><span>全选</span></label>}<button className="icon-button queue-clear" aria-label="删除全部画布" disabled={disabled} onClick={onClear}><Trash size={22} weight="bold"/></button></div>}</div>
  <div className="filmstrip canvas-cards" aria-label="图像画布">
   <div className="film-item add-item"><button className="add-tile" aria-label="新建图像" disabled={disabled} onClick={onCreate}><Plus size={38} weight="bold"/></button><span className="filename">新建图像</span></div>
   {projects.map(project=><div key={project.id} className={`film-item canvas-card ${project.id===currentId?'selected':''}`} onContextMenu={event=>{if(event.target.closest('input'))return;event.preventDefault();if(!disabled)onContext(project.id,{x:event.clientX,y:event.clientY});}}>
    <button className="film-select canvas-card-open" aria-label={`打开画布 ${canvasName(project.name)}`} aria-pressed={project.id===currentId} disabled={disabled} draggable={false} onClick={()=>onOpen(project.id)}>
     {project.thumbnail
      ? <img src={project.thumbnail} loading="lazy" decoding="async" draggable={false} alt={`${canvasName(project.name)}画布预览`}/>
      : <ImageSquare size={35} weight="duotone"/>}
    </button>
    {eligible.has(project.id)&&<label className="canvas-export-select" title="选择导出"><input type="checkbox" aria-label={`选择导出 ${canvasName(project.name)}`} checked={chosen.has(project.id)} disabled={disabled} onChange={event=>onSelectExport(project.id,event.target.checked)}/></label>}
    <CanvasCardName ref={renamingId===project.id?renameInput:null} project={project} editing={renamingId===project.id} disabled={disabled} onStart={onRenameStart} onRename={onRename} onEnd={onRenameEnd}/>
   </div>)}
  </div>
 </div>;
}
