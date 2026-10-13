import {Plus,Trash,ImageSquare} from '@phosphor-icons/react';
import {canvasName} from './names.js';
import {blockPreviewDrag} from '../file-drop.js';

export function CanvasCards({projects,currentId,onOpen,onCreate,onClear,onContext,disabled}){
 return <div className="queue-region canvas-cards-region" onDragStart={blockPreviewDrag}>
  <div className="queue-toolbar"><span>图像<span className="queue-count">{projects.length}</span></span><button className="icon-button queue-clear" aria-label="删除全部画布" disabled={disabled||!projects.length} onClick={onClear}><Trash size={22} weight="bold"/></button></div>
  <div className="filmstrip canvas-cards" aria-label="图像画布">
   {projects.map(project=><div key={project.id} className={`film-item canvas-card ${project.id===currentId?'selected':''}`}>
    <button className="film-select canvas-card-open" aria-label={`打开画布 ${canvasName(project.name)}`} aria-pressed={project.id===currentId} disabled={disabled} draggable={false} onClick={()=>onOpen(project.id)} onContextMenu={event=>{event.preventDefault();if(!disabled)onContext(project.id,{x:event.clientX,y:event.clientY});}}>
     {project.thumbnail?<img src={project.thumbnail} loading="lazy" decoding="async" draggable={false} alt={`${canvasName(project.name)}画布预览`}/>:<ImageSquare size={35} weight="duotone"/>}
    </button>
    <span className="filename" title={project.name}>{canvasName(project.name)}</span>
   </div>)}
   <div className="film-item add-item"><button className="add-tile" aria-label="新建画布" disabled={disabled} onClick={onCreate}><Plus size={38} weight="bold"/></button><span className="filename">新建画布</span></div>
  </div>
 </div>;
}
