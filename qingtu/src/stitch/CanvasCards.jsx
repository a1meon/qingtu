import {Plus,Trash,ImageSquare} from '@phosphor-icons/react';
import {canvasName} from './names.js';

export function CanvasCards({projects,currentId,checked,onCheck,onOpen,onCreate,onRemove,disabled}){
 return <div className="queue-region canvas-cards-region">
  <div className="queue-toolbar"><span>图像<span className="queue-count">{projects.length}</span></span></div>
  <div className="filmstrip canvas-cards" aria-label="图像画布">
   {projects.map(project=><div key={project.id} className={`film-item canvas-card ${project.id===currentId?'selected':''}`}>
    <button className="film-select canvas-card-open" aria-label={`打开画布 ${canvasName(project.name)}`} aria-pressed={project.id===currentId} disabled={disabled} onClick={()=>onOpen(project.id)}>
     {project.thumbnail?<img src={project.thumbnail} loading="lazy" decoding="async" alt={`${canvasName(project.name)}画布预览`}/>:<ImageSquare size={35} weight="duotone"/>}
    </button>
    <input className="canvas-card-check" type="checkbox" aria-label={`批量选择 ${canvasName(project.name)}`} checked={checked.includes(project.id)} disabled={disabled} onChange={event=>onCheck(project.id,event.target.checked)}/>
    <button className="film-remove" aria-label={`删除画布 ${canvasName(project.name)}`} disabled={disabled} onClick={()=>onRemove(project.id)}><Trash size={15}/></button>
    <span className="filename" title={project.name}>{canvasName(project.name)}</span>
   </div>)}
   <div className="film-item add-item"><button className="add-tile" aria-label="新建画布" disabled={disabled} onClick={onCreate}><Plus size={38} weight="bold"/></button><span className="filename">新建画布</span></div>
  </div>
 </div>;
}
