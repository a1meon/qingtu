import {forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Plus,X,PencilSimple,Sparkle,ArrowCounterClockwise,SidebarSimple,FolderSimple,SpinnerGap,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {api,desktop} from '../api.js';
import {Dropdown} from '../Dropdown.jsx';
import {TooltipButton} from '../TooltipButton.jsx';
import {calculateLayout,moveImage,initializeFree} from '../../engine/stitch-layout.mjs';
import {setImageEdit,cropLimit} from '../../engine/stitch-edits.mjs';
import {optimizeHorizontal} from '../../engine/stitch-optimize.mjs';
import {appendProjectImages,removeProjectImage,resetProject} from '../../engine/stitch-reset.mjs';
import {repository} from './repository.js';
import {useProjects} from './useProjects.js';
import {StitchCanvas} from './StitchCanvas.jsx';
import {CanvasCards} from './CanvasCards.jsx';
import {ImageEditor} from './ImageEditor.jsx';
import {canvasName} from './names.js';
import {addFlushHandler} from '../lifecycle.js';
import {outputFormats,explicitFormat,megabytes} from '../export-format.js';

export const StitchWorkspace=forwardRef(function StitchWorkspace({active,inspectorOpen,setInspectorOpen,onBusy,onCount},ref){
 const {projects,project,update,open,create,remove,loading,saving,saveError,flush,retry,getCurrent}=useProjects();
 const [editing,setEditing]=useState(null),[editorAnchor,setEditorAnchor]=useState(null),[cropDraft,setCropDraft]=useState(null),editor=useRef();
 const [selected,setSelected]=useState(null),[checked,setChecked]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[importing,setImporting]=useState(false),[batch,setBatch]=useState(null),[output,setOutput]=useState(null),[processing,setProcessing]=useState(false),[folder,setFolder]=useState(null);
 const unit=project?.export.unit||'MB',setUnit=unit=>setExport({unit});
 useEffect(()=>{setSelected(project?.images[0]?.id||null);setEditing(null);setCropDraft(null);},[project?.id]);
 const input=useRef(),cancel=useRef(false),exportTask=useRef(Promise.resolve()),importTask=useRef(Promise.resolve()),lastPreview=useRef();
 const displayProject=useMemo(()=>cropDraft?setImageEdit(project,cropDraft.id,{...cropDraft.edit,amount:Number(cropDraft.edit.amount)||0}):project,[project,cropDraft]);
 const calculation=useMemo(()=>{try{return {layout:calculateLayout(displayProject||{})};}catch(e){try{return {layout:calculateLayout(displayProject||{},{draft:true}),error:e.message};}catch{return {error:e.message};}}},[displayProject]);
 const {layout}=calculation;
 const busy=loading||importing||!!batch;
 useEffect(()=>{onBusy(busy||saving||processing||!!saveError||!!cropDraft);onCount(project?.images.length||0);},[busy,saving,processing,saveError,cropDraft,project?.images.length]);
 const flushEditor=()=>editor.current?.flush()||Promise.resolve();
 useEffect(()=>addFlushHandler(async()=>{await flushEditor();await importTask.current;await exportTask.current;await flush();}),[]);
 useEffect(()=>{
  if(!active){setProcessing(false);return;}
  if(!busy&&!cropDraft&&lastPreview.current?.project===project){setOutput(lastPreview.current.result);setProcessing(false);return;}
  let live=true;setOutput(null);setError('');
  if(!active||!layout||calculation.error||busy||cropDraft){setProcessing(false);return;}
  setProcessing(true);const timer=setTimeout(()=>api.stitchRender(project,{latest:true}).then(result=>{if(live){lastPreview.current={project,result};setOutput(result);}}).catch(e=>{if(live&&!e.message.includes('预览参数已更新'))setError(e.message);}).finally(()=>{if(live)setProcessing(false);}),500);
  return()=>{live=false;clearTimeout(timer);};
 },[active,project,busy,!!cropDraft]);
 async function settleEditor(){await flushEditor();setEditing(null);setCropDraft(null);}
 function selectImage(id){if(editing&&editing!==id){flushEditor().catch(()=>{});setEditing(null);setCropDraft(null);}setSelected(id);}
 async function editImage(id,anchor){try{if(editing!==id)await settleEditor();setSelected(id);setEditorAnchor(anchor||null);setEditing(id);}catch(e){setNotice(e.message);}}
 function commitCrop(id,edit){setCropDraft(null);return update(p=>setImageEdit(p,id,edit));}
 async function optimize(){try{await settleEditor();const current=getCurrent(),next=optimizeHorizontal(current);if(next!==current)await update(next);setNotice(next===current?'已是 2.5:1':`已优化为 2.5:1 · ${next.export.longEdge} × ${next.export.longEdge*2/5}`);}catch(e){setNotice(e.message);}}
 async function reset(){try{await settleEditor();await update(resetProject(getCurrent()));setNotice('已重置裁剪和顺序');}catch(e){setNotice(e.message);}}
 async function accept(items){
  if(items.length){await update(p=>{if(p.images.length+items.length>100||p.images.reduce((s,i)=>s+i.bytes,0)+items.reduce((s,i)=>s+i.bytes,0)>500*1024*1024)throw new Error('每个项目最多 100 张、500 MB');return appendProjectImages(p,items);});setSelected(items[0].id);}
 }
 async function runImportFiles(files){
  if(busy||!project)return;const list=Array.from(files);if(!list.length)return;await settleEditor();setImporting(true);setNotice('');
  try{for(const file of list){const item=await repository.import(file);await accept([item]);}}
  catch(e){setNotice(e.message);}finally{setImporting(false);if(input.current)input.current.value='';}
 }
 function importFiles(files){const task=runImportFiles(files);importTask.current=task;return task;}
 async function runAdd(){
  if(busy||!project)return;await settleEditor();if(!desktop){input.current.click();return;}
  setImporting(true);try{const result=await api.stitchChooseFiles();await accept(result.items);if(result.errors.length)setNotice(result.errors.join('；'));}catch(e){setNotice(e.message);}finally{setImporting(false);}
 }
 function add(){const task=runAdd();importTask.current=task;return task;}
 async function chooseFolder(){const value=await api.chooseFolder();if(value)setFolder(value);return value;}
 async function runExport(ids){
  if(busy||!ids.length)return;await flushEditor();await flush();const current=getCurrent();if(!folder&&!await chooseFolder())return;
  cancel.current=false;setBatch({current:0,total:ids.length});setNotice('');let success=0;const failures=[];
  try{
   for(let n=0;n<ids.length;n++){
    if(cancel.current)break;setBatch({current:n+1,total:ids.length});
    try{const snapshot=ids[n]===current.id?structuredClone(current):await repository.load(ids[n]);snapshot.export={...snapshot.export,format:explicitFormat(snapshot.export?.format)};await repository.prepare(snapshot,{previews:false});const result=await api.stitchRender(snapshot);await api.save(result.token);success++;}
    catch(e){failures.push(`${projects.find(p=>p.id===ids[n])?.name||'拼图'}：${e.message}`);}
   }
   setNotice(`已导出 ${success} 个项目${failures.length?'；'+failures.join('；'):cancel.current?'，已取消':''}`);
  }finally{setBatch(null);}
 }
 function exportProjects(ids){const task=runExport(ids).catch(e=>setNotice(e.message));exportTask.current=task;return task;}
 useImperativeHandle(ref,()=>({add,importFiles,export:()=>exportProjects(project?[project.id]:[])}));
 async function setLayout(type){
  try{await settleEditor();const current=getCurrent();if(type===current.layout)return;
  if(type==='free'){
   if(!current.images.length){update({layout:type,positions:{}});return;}
   let currentLayout;try{currentLayout=calculateLayout(current);}catch{currentLayout=calculateLayout(current,{draft:true});}
   update(initializeFree(current,currentLayout,'centres'));
  }else update({layout:type});
  }catch(e){setNotice(e.message);}
 }
 const setExport=changes=>update(p=>({...p,export:{...p.export,...changes}}));
 async function removeImage(id){try{await settleEditor();await update(p=>removeProjectImage(p,id));if(selected===id)setSelected(null);}catch(e){setNotice(e.message);}}
 async function reorder(from,to){try{await settleEditor();update(p=>({...p,images:moveImage(p.images,from,to)}));}catch(e){setNotice(e.message);}}
 async function openCanvas(id){try{await settleEditor();await open(id);}catch(e){setNotice(e.message);}}
 async function createCanvas(){try{await settleEditor();await create();}catch(e){setNotice(e.message);}}
 async function removeCanvas(id){try{await settleEditor();await remove(id);setChecked(old=>old.filter(item=>item!==id));}catch(e){setNotice(e.message);}}
 const editingImage=project?.images.find(image=>image.id===editing);
 const editingRect=layout?.rects.find(rect=>rect.id===editing);
 const savedEdit=project?.edits?.[editing];
 const editingValue=savedEdit?.fraction!=null?{axis:'horizontal',amount:Math.min(cropLimit(editingImage,'horizontal'),Math.round(savedEdit.fraction*editingImage.width))}:savedEdit||(editingImage&&editingRect?.autoCrop?{axis:'horizontal',amount:Math.min(cropLimit(editingImage,'horizontal'),Math.round(editingRect.crop.left*editingImage.width))}:undefined);
 return <>
  <input ref={input} type="file" className="sr-only" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择拼接图片文件" onChange={e=>importFiles(e.target.files)}/>
  <section className="stage stitch-stage" aria-label="拼接工作台">
   <div className="preview-workspace">
    <div className="file-toolbar">
     <input className="project-name" aria-label="项目名称" maxLength="80" value={project?canvasName(project.name):''} disabled={busy||!project} onChange={e=>update({name:e.target.value})}/>
     <div className="preview-actions">
      <span className={`save-status ${saveError?'error':''}`} role="status">{saveError?'未保存':saving?'保存中…':'已自动保存'}</span>
      <div className="view-switch canvas-actions" role="group" aria-label="画布工具"><button className="canvas-optimize" aria-label="一键优化" title={project?.layout==='horizontal'?'从原图统一左右裁剪为 2.5:1':'仅横排可用'} disabled={busy||!project?.images.length||project.layout!=='horizontal'} onClick={optimize}><Sparkle size={17} weight="fill"/>一键优化</button><TooltipButton label="编辑选中图片" className="icon-button" disabled={busy||!selected} onClick={event=>{const r=event.currentTarget.getBoundingClientRect();editImage(selected,{x:r.left,y:r.bottom+8});}}><PencilSimple size={19}/></TooltipButton><TooltipButton label="重置裁剪与顺序" className="icon-button" disabled={busy||!project?.images.length} onClick={reset}><ArrowCounterClockwise size={19}/></TooltipButton></div>
      {!inspectorOpen&&<TooltipButton label="展开导出设置" placement="left" className="icon-button panel-toggle" onClick={()=>setInspectorOpen(true)}><SidebarSimple size={23}/></TooltipButton>}
     </div>
    </div>
    {project?.images.length?<>
     <div className="canvas-area"><div className="canvas-content"><div className="stitch-editing-surface">
      <StitchCanvas project={displayProject} layout={layout} selected={selected} onSelect={selectImage} onEdit={editImage} onRemove={removeImage} onReorder={reorder} onChange={positions=>update({positions})} disabled={busy||!!cropDraft}/>
      {editingImage&&<ImageEditor key={editingImage.id} ref={editor} image={editingImage} value={editingValue} anchor={editorAnchor} hidden={!active} disabled={busy} onPreview={edit=>setCropDraft(edit?{id:editingImage.id,edit}:null)} onCommit={edit=>commitCrop(editingImage.id,edit)} onClose={()=>{setEditing(null);setCropDraft(null);}}/>}
     </div>
     <div className="preview-info stitch-info" aria-live="polite"><span>{layout?`${layout.width} × ${layout.height}`:calculation.error}</span>{layout?.rects.some(r=>r.autoCrop)&&<span>9:16 居中裁切</span>}<span className="preview-status" title={output?`${output.bytes.toLocaleString()} 字节${output.difference?`；RGB 最大误差 ${output.difference.maxError}/255，RMSE ${output.difference.rmse.toFixed(4)}；透明度误差 ${output.difference.alphaMaxError}`:''}`:undefined}>{cropDraft?'编辑中…':processing?'计算中…':output?`${output.encoding||output.format.toUpperCase()} · ${megabytes(output.bytes)}`:error}</span></div></div></div>
    </>:<div className="canvas-area"><div className="empty-state"><img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/><button className="primary import-button" aria-label="添加拼接图片" disabled={busy||!project} onClick={add}><Plus size={28} weight="bold"/>{loading?'恢复中…':'添加图片'}</button></div></div>}
   </div>
   <CanvasCards projects={projects} currentId={project?.id} checked={checked} disabled={busy}
    onCheck={(id,value)=>setChecked(old=>value?[...old,id]:old.filter(item=>item!==id))}
    onOpen={openCanvas} onCreate={createCanvas} onRemove={removeCanvas}/>
  </section>
  <div className="inspector-shell"><aside className="inspector" aria-label="拼接导出设置" aria-hidden={!inspectorOpen} inert={!inspectorOpen}>
   <div className="inspector-heading"><h1>拼接</h1><TooltipButton label="收起导出设置" placement="left" className="icon-button panel-toggle" onClick={()=>setInspectorOpen(false)}><SidebarSimple size={23}/></TooltipButton></div>
   <div className="settings-scroll">
    <div className="control-section"><label htmlFor="stitch-target">大小上限</label><div className="target-control"><input id="stitch-target" type="number" min="1" max={unit==='MB'?100:100000} step="1" disabled={busy||!project} value={project?(project.export.targetBytes/(unit==='MB'?1000000:1000)):10} onChange={e=>setExport({targetBytes:Number(e.target.value)*(unit==='MB'?1000000:1000)})}/><Dropdown label="拼接大小单位" className="unit-dropdown" value={unit} onChange={setUnit} disabled={busy||!inspectorOpen} options={[{value:'MB',label:'MB'},{value:'KB',label:'KB'}]}/></div></div>
    <div className="control-section"><label htmlFor="stitch-long-edge">长边</label><div className="number-with-unit"><input id="stitch-long-edge" type="number" min="1" max="5999" disabled={busy||!project} value={project?.export.longEdge||''} onChange={e=>setExport({longEdge:Number(e.target.value)})}/><span>px</span></div></div>
    <div className="control-section"><h2>布局</h2><div className="layout-options">{[['horizontal','横排'],['grid','宫格'],['vertical','竖排'],['free','自由']].map(([type,label])=><button key={type} data-layout={type} disabled={busy||!project} className={project?.layout===type?'active':''} aria-pressed={project?.layout===type} onClick={()=>setLayout(type)}>{label}</button>)}</div></div>
    <div className="control-section"><label htmlFor="stitch-format">格式</label><Dropdown id="stitch-format" label="拼接输出格式" value={explicitFormat(project?.export.format)} onChange={format=>setExport({format})} disabled={busy||!project||!inspectorOpen} options={outputFormats}/></div>
    {project?.layout==='grid'&&<div className="control-section"><h2>行列</h2><div className="dimension-inputs stitch-pair"><div className="number-with-unit"><input aria-label="宫格行数" type="number" min="1" max="100" disabled={busy} value={project.grid.rows} onChange={e=>update({grid:{...project.grid,rows:Number(e.target.value)}})}/><span>行</span></div><div className="number-with-unit"><input aria-label="每行最多列数" type="number" min="1" max="100" disabled={busy} value={project.grid.columns} onChange={e=>update({grid:{...project.grid,columns:Number(e.target.value)}})}/><span>列</span></div></div></div>}
   </div>
   <div className="export-section">
    {(saveError||calculation.error&&project?.images.length>0||error)&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{saveError||calculation.error||error}</span>{saveError&&<button onClick={retry}>重试</button>}</div>}
    <label>输出文件夹</label><button className="folder-control" disabled={busy} onClick={()=>chooseFolder().catch(e=>setNotice(e.message))}><FolderSimple size={23}/><span>{folder?.name||'选择文件夹'}</span></button>
    <button className="primary export-button" disabled={busy||!!cropDraft||!layout||!!calculation.error||!!saveError||!!error} onClick={()=>exportProjects([project.id])}>{batch?<><SpinnerGap className="spin" size={23}/>导出 {batch.current} / {batch.total}</>:'导出当前拼图'}</button>
    <div className="export-secondary"><button className="batch-project-export" disabled={busy||!!cropDraft||!checked.length||!!saveError} onClick={()=>exportProjects(checked)}>批量导出 {checked.length} 个项目</button>{batch&&<button className="cancel-button" onClick={()=>{cancel.current=true;}}>取消后续</button>}</div>
   </div>
  </aside></div>
  {notice&&active&&<div className="notice" role="status"><CheckCircle size={23}/><span>{notice}</span><button className="icon-button" aria-label="关闭拼接提示" onClick={()=>setNotice('')}><X size={18}/></button></div>}
 </>;
});
