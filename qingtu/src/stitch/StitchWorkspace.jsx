import {forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Plus,X,PencilSimple,Trash,Export,SidebarSimple,FolderSimple,SpinnerGap,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {api,desktop} from '../api.js';
import {Dropdown} from '../Dropdown.jsx';
import {TooltipButton} from '../TooltipButton.jsx';
import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {arrangeImages,arrangeContentImages} from '../../engine/canvas-fixed.mjs';
import {setImageEdit} from '../../engine/stitch-edits.mjs';
import {removeProjectImage,resetProject} from '../../engine/stitch-reset.mjs';
import {importCanvasImages} from '../../engine/canvas-import.mjs';
import {repository} from './repository.js';
import {useProjects} from './useProjects.js';
import {StitchCanvas} from './StitchCanvas.jsx';
import {CanvasCards} from './CanvasCards.jsx';
import {ImageEditor} from './ImageEditor.jsx';
import {canvasName} from './names.js';
import {addFlushHandler} from '../lifecycle.js';
import {outputFormats,explicitFormat,megabytes} from '../export-format.js';
import {CanvasTools} from './CanvasTools.jsx';
import {ContextMenu} from './ContextMenu.jsx';
import {ConfirmDialog,OptimizeDialog} from './ActionDialogs.jsx';
import {performOptimization} from './optimization.js';
import {exportProjectIds} from './project-export.js';
import {originalBytes} from '../../engine/image-source.mjs';
import {splitProjectImage,fullSourcePosition} from '../../engine/stitch-split.mjs';
import {switchCanvasLayout} from '../../engine/canvas-layout-state.mjs';
import {CANVAS_PRESETS,canvasPresetValue,presetCanvas} from '../../engine/canvas-presets.mjs';
import {prepareLayoutPreview} from './layout-preview.js';
import {applyCanvasTransform} from '../../engine/canvas-transform.mjs';
import {reorderCanvas} from '../../engine/canvas-order.mjs';
import {rotateProjectImage,setProjectImageAngle} from '../../engine/image-rotation.mjs';
import {rotatePreview} from './rotate-preview.js';

export const StitchWorkspace=forwardRef(function StitchWorkspace({active,inspectorOpen,inspectorRevision,setInspectorOpen,onBusy,onCount},ref){
 const {projects,project,update,open,create,remove,clear,loading,saving,saveError,flush,retry,getCurrent}=useProjects();
 const [editing,setEditing]=useState(null),[imageMode,setImageMode]=useState('crop'),[cropDraft,setCropDraft]=useState(null),[splitDraft,setSplitDraft]=useState(null),[transformCanvas,setTransformCanvas]=useState(null),[angleDraft,setAngleDraft]=useState(null),editor=useRef(),navigationSlot=useRef();
 const [selected,setSelected]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[importing,setImporting]=useState(false),[batch,setBatch]=useState(null),[output,setOutput]=useState(null),[processing,setProcessing]=useState(false),[folder,setFolder]=useState(null);
 const [context,setContext]=useState(null),[confirmation,setConfirmation]=useState(null),[optimization,setOptimization]=useState(null),[optimizing,setOptimizing]=useState(false),[splitting,setSplitting]=useState(false),[rotating,setRotating]=useState(false);
 const [exportSelection,setExportSelection]=useState(null);
 const [renaming,setRenaming]=useState(null);
 const unit=project?.export.unit||'MB',setUnit=unit=>setExport({unit});
 useEffect(()=>{setSelected(project?.images[0]?.id||null);setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);},[project?.id]);
 const input=useRef(),cancel=useRef(false),exportTask=useRef(Promise.resolve()),importTask=useRef(Promise.resolve()),actionTask=useRef(Promise.resolve()),optimizeTask=useRef(Promise.resolve()),splitTask=useRef(Promise.resolve()),importLock=useRef(false),exportLock=useRef(false),lastPreview=useRef();
 const previewTasks=useRef(new Set()),previewTimer=useRef(),flushing=useRef(false);
 const splitLock=useRef(false),removeLock=useRef(false),rotationLock=useRef(false);
 const displayProject=useMemo(()=>{
  if(splitDraft&&project?.images.some(image=>image.id===splitDraft.id)){const edits={...project.edits};delete edits[splitDraft.id];return {...project,edits,positions:{...project.positions,[splitDraft.id]:fullSourcePosition(project,splitDraft.id)}};}
  const cropped=cropDraft?setImageEdit(project,cropDraft.id,cropDraft.edit):project;
  return angleDraft&&cropped?setProjectImageAngle(cropped,angleDraft.id,angleDraft.angle):cropped;
 },[project,cropDraft,splitDraft?.id,angleDraft]);
 const calculation=useMemo(()=>{try{return {layout:calculateLayout(displayProject||{})};}catch(e){try{return {layout:calculateLayout(displayProject||{},{draft:true}),error:e.message};}catch{return {error:e.message};}}},[displayProject]);
 const {layout}=calculation;
 const busy=loading||importing||!!batch||optimizing||splitting||rotating||!!confirmation||!!optimization;
 const exportableIds=exportProjectIds(projects,project),exportIds=exportProjectIds(projects,project,exportSelection);
 function selectExport(id,checked){setExportSelection(previous=>{const ids=exportProjectIds(projects,getCurrent(),previous);return checked?[...ids,id]:ids.filter(value=>value!==id);});}
 useEffect(()=>setContext(null),[active,project?.id,busy]);
 useEffect(()=>{onBusy(busy||saving||processing||!!saveError||!!cropDraft||!!splitDraft||!!transformCanvas||!!angleDraft);onCount(project?.images.length||0);},[busy,saving,processing,saveError,cropDraft,splitDraft,transformCanvas,angleDraft,project?.images.length]);
 useEffect(()=>{
  const removeSelected=event=>{
   if(!active||busy||renaming||transformCanvas||cropDraft?.gesture||!selected||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!['Delete','Backspace'].includes(event.key))return;
   if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
   if(!getCurrent()?.images.some(image=>image.id===selected))return;
   event.preventDefault();removeImage(selected);
  };
  window.addEventListener('keydown',removeSelected);return()=>window.removeEventListener('keydown',removeSelected);
 },[active,busy,renaming,transformCanvas,cropDraft?.gesture,selected,project?.id]);
 const flushEditor=()=>editor.current?.flush()||Promise.resolve();
 useEffect(()=>{if(!active)flushEditor().then(()=>{setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);}).catch(()=>{});},[active]);
 useEffect(()=>addFlushHandler(async()=>{flushing.current=true;clearTimeout(previewTimer.current);try{await flushEditor();await importTask.current;await exportTask.current;await optimizeTask.current;await splitTask.current;await actionTask.current;await Promise.allSettled([...previewTasks.current]);await flush();}finally{flushing.current=false;}}),[]);
 useEffect(()=>{
  if(!active){setProcessing(false);return;}
  if(!busy&&!cropDraft&&!splitDraft&&!transformCanvas&&!angleDraft&&lastPreview.current?.project===project){setOutput(lastPreview.current.result||null);setError(lastPreview.current.error||'');setProcessing(false);return;}
  let live=true;setOutput(null);setError('');
  if(!active||!project?.images.length||!layout||calculation.error||busy||cropDraft||splitDraft||transformCanvas||angleDraft||flushing.current){setProcessing(false);return;}
  setProcessing(true);const timer=previewTimer.current=setTimeout(()=>{const task=api.stitchRender(project,{latest:true}).then(result=>{if(live){lastPreview.current={project,result};setOutput(result);}}).catch(e=>{if(live&&!e.message.includes('预览参数已更新'))setError(e.message);}).finally(()=>{previewTasks.current.delete(task);if(live)setProcessing(false);});previewTasks.current.add(task);},500);
  return()=>{live=false;clearTimeout(timer);};
 },[active,project,busy,!!cropDraft,!!splitDraft,!!transformCanvas,!!angleDraft]);
 async function settleEditor(){await flushEditor();setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);}
 function selectImage(id){if(editing&&editing!==id){flushEditor().catch(()=>{});setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);}setSelected(id);}
 async function editImage(id){try{if(editing!==id)await settleEditor();setSelected(id);setImageMode('crop');setEditing(id);}catch(e){setNotice(e.message);}}
 function commitCrop(id,edit){setCropDraft(null);return update(p=>setImageEdit(p,id,edit));}
 async function runOptimize(){
  let phase='calculate';
  try{await settleEditor();const current=getCurrent(),cache=lastPreview.current;
   const value=await performOptimization({project:current,save:update,preparePreview:prepareLayoutPreview,reuse:cache?.project===current?cache.result:null,onPhase:next=>{phase=next;setOptimization({phase:next});}});
   lastPreview.current=value.layoutOnly?null:{project:getCurrent(),result:value.result};setOutput(value.layoutOnly?null:value.result);setError('');setProcessing(false);setOptimization(null);
  }catch(e){if(phase==='render'){lastPreview.current={project:getCurrent(),error:e.message};setError(e.message);}setOptimization({phase:'error',failedAt:phase,message:e.message});}
  finally{setOptimizing(false);}
 }
 function optimize(){if(busy)return;setOptimizing(true);setOptimization({phase:'prepare'});const task=runOptimize();optimizeTask.current=task;return task;}
 function setOptimizationSettings(settings){
  const current=getCurrent(),cache=lastPreview.current,task=update({optimization:settings});
  // These settings only affect the next explicit optimization. Reuse the
  // unchanged rendered pixels while the new parameters are autosaved.
  if(cache?.project===current)lastPreview.current={...cache,project:getCurrent()};
  return task;
 }
 function splitImage(id,axis,at){
  if(busy||splitLock.current)return splitTask.current;
  splitLock.current=true;setSplitting(true);
  const task=(async()=>{await flushEditor();const ids=[crypto.randomUUID(),crypto.randomUUID()];await update(p=>splitProjectImage(p,id,axis,at,ids));setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);setSelected(ids[0]);})().catch(e=>{setNotice(e.message);throw e;}).finally(()=>{splitLock.current=false;setSplitting(false);});
  splitTask.current=task.catch(()=>{});return task;
 }
 function rotateImage(id,degrees){
  if(busy||rotationLock.current)return actionTask.current;
  rotationLock.current=true;setRotating(true);const owner=getCurrent()?.id;
  const task=(async()=>{
   await flushEditor();const current=getCurrent();if(current?.id!==owner)throw new Error('画布已切换，请重新选择图片');
   const image=current.images.find(image=>image.id===id);if(!image)throw new Error('图片已移除');
   const preview=await rotatePreview(image.preview,degrees);
   await update(p=>{if(p.id!==owner)throw new Error('画布已切换，请重新选择图片');const next=rotateProjectImage(p,id,degrees);return {...next,images:next.images.map(image=>image.id===id?{...image,preview}:image)};});
  })().catch(e=>setNotice(e.message)).finally(()=>{rotationLock.current=false;setRotating(false);});
  actionTask.current=task;return task;
 }
 function commitAngle(id,angle,revision){
  const owner=getCurrent()?.id;
  const task=update(p=>{if(p.id!==owner)throw new Error('画布已切换，请重新选择图片');return setProjectImageAngle(p,id,angle);}).then(()=>setAngleDraft(current=>current?.id===id&&current.revision<=revision?null:current));
  actionTask.current=task;return task;
 }
 function requestReset(){setConfirmation({kind:'reset',id:project.id,title:'重置当前画布？',description:'恢复导入大小、裁剪和顺序。自动布局重新排列，自由布局保留图片中心。',label:'重置'});}
 function requestRemoveCanvas(id){const value=projects.find(p=>p.id===id);if(value)setConfirmation({kind:'remove',id,title:'删除这个画布？',description:canvasName(value.name),danger:true,label:'删除'});}
 function requestClear(){setConfirmation({kind:'clear',title:'删除全部画布？',description:`删除 ${projects.length} 个画布项目，原始文件保留。`,danger:true,label:'全部删除'});}
 async function runConfirmed(){
  const request=confirmation;await settleEditor();
  if(request.kind==='reset'){if(getCurrent().id!==request.id)throw new Error('当前画布已切换，请重新确认');await update(resetProject(getCurrent()));setNotice('已重置裁剪、缩放和顺序');}
  else if(request.kind==='remove')await remove(request.id);
  else await clear();
  setConfirmation(null);
 }
 function confirm(){const task=runConfirmed();actionTask.current=task.catch(()=>{});return task;}
 async function contextImage(id,anchor){if(busy)return;try{await settleEditor();setSelected(id);setContext({type:'image',id,anchor});}catch(e){setNotice(e.message);}}
 function contextCanvas(id,anchor){if(!busy)setContext({type:'canvas',id,anchor});}
 async function accept(items,owner){
  if(items.length){await update(p=>{if(p.id!==owner)throw new Error('当前画布已切换，请重新导入');if(p.images.length+items.length>100||originalBytes([...p.images,...items])>500*1024*1024)throw new Error('每个项目最多 100 张、500 MB');return importCanvasImages(p,items);});setSelected(items[0].id);}
 }
 async function runImportFiles(files){
  if(busy||importLock.current)return;const list=Array.from(files);if(!list.length)return;importLock.current=true;setImporting(true);setNotice('');
  try{await settleEditor();const owner=(getCurrent()||await create()).id;for(const file of list){const item=await repository.import(file);await accept([item],owner);}}
  catch(e){setNotice(e.message);}finally{importLock.current=false;setImporting(false);if(input.current)input.current.value='';}
 }
 function importFiles(files){if(busy||importLock.current||!files.length)return importTask.current;const task=runImportFiles(files);importTask.current=task;return task;}
 async function runAdd(){
  if(busy||importLock.current||!project)return;const owner=project.id;importLock.current=true;setImporting(true);
  try{await settleEditor();if(!desktop){input.current.click();return;}const result=await api.stitchChooseFiles();await accept(result.items,owner);if(result.errors.length)setNotice(result.errors.join('；'));}catch(e){setNotice(e.message);}finally{importLock.current=false;setImporting(false);}
 }
 function add(){if(!project&&!busy){setNotice('请先新建画布');return importTask.current;}if(busy||importLock.current)return importTask.current;const task=runAdd();importTask.current=task;return task;}
 async function chooseFolder(){const value=await api.chooseFolder();if(value)setFolder(value);return value;}
 async function runExport(ids){
  if(busy||splitDraft||!ids.length)return;
  cancel.current=false;setBatch({current:0,total:ids.length});let success=0;const failures=[],adjusted=[];
  try{
   await flushEditor();await flush();const current=getCurrent();if(!folder&&!await chooseFolder())return;setNotice('');
   for(let n=0;n<ids.length;n++){
    if(cancel.current)break;setBatch({current:n+1,total:ids.length});
    try{let snapshot=ids[n]===current?.id?structuredClone(current):await repository.load(ids[n]);snapshot.export={...snapshot.export,format:explicitFormat(snapshot.export?.format)};snapshot=await repository.prepare(snapshot,{previews:false});const result=await api.stitchRender(snapshot);await api.save(result.token);success++;if(result.autoResized)adjusted.push(`${canvasName(snapshot.name)} ${result.width} × ${result.height}`);}
    catch(e){failures.push(`${canvasName(projects.find(p=>p.id===ids[n])?.name)}：${e.message}`);}
   }
   setNotice(`已导出 ${success} 张图像${failures.length?'；'+failures.join('；'):cancel.current?'，已取消':''}${adjusted.length?'；等比调整：'+adjusted.join('，'):''}`);
  }finally{setBatch(null);}
 }
 function exportProjects(ids){if(busy||exportLock.current||!ids.length)return exportTask.current;exportLock.current=true;const task=runExport(ids).catch(e=>setNotice(e.message)).finally(()=>{exportLock.current=false;});exportTask.current=task;return task;}
 useImperativeHandle(ref,()=>({add,importFiles,export:()=>exportProjects(exportIds)}));
 async function setLayout(type){
  try{await settleEditor();if(getCurrent()?.layout!==type)await update(p=>switchCanvasLayout(p,type));}catch(e){setNotice(e.message);}
 }
 async function setGrid(changes){try{await settleEditor();await update(p=>{const grid={...p.grid,...changes};try{return p.canvasSizing==='content'?arrangeContentImages(p,'grid',grid):arrangeImages(p,'grid',grid);}catch(e){if(e.message.includes('行列'))return {...p,grid};throw e;}});}catch(e){setNotice(e.message);}}
 const setCanvas=changes=>update(p=>({...p,canvasSizing:'manual',canvas:{...p.canvas,...changes},export:{...p.export,longEdge:Math.max(changes.width??p.canvas.width,changes.height??p.canvas.height)}}));
 async function setPreset(value){if(value==='custom')return;try{await settleEditor();await setCanvas(presetCanvas(value));}catch(e){setNotice(e.message);}}
 const setExport=changes=>update(p=>({...p,export:{...p.export,...changes}}));
 function removeImage(id){
  if(busy||removeLock.current)return actionTask.current;
  const owner=getCurrent()?.id;if(!owner)return;
  removeLock.current=true;
  const task=(async()=>{await settleEditor();await update(p=>{if(p.id!==owner)throw new Error('画布已切换，请重新选择图片');return removeProjectImage(p,id);});setSelected(current=>current===id?null:current);setContext(null);})().catch(e=>setNotice(e.message)).finally(()=>{removeLock.current=false;});
  actionTask.current=task;return task;
 }
 async function reorder(from,to){try{await settleEditor();await update(p=>reorderCanvas(p,from,to));}catch(e){setNotice(e.message);}}
 async function openCanvas(id){if(busy||importLock.current)return;try{await settleEditor();await open(id);}catch(e){setNotice(e.message);}}
 async function startRename(id){if(busy||importLock.current)return;try{await settleEditor();if(getCurrent()?.id!==id)await open(id);setRenaming(id);}catch(e){setNotice(e.message);}}
 function renameCanvas(id,name){
  const task=Promise.resolve().then(()=>{if(getCurrent()?.id!==id)throw new Error('画布已切换，请重新命名');return update({name});});
  actionTask.current=task.catch(()=>{});return task;
 }
 const endRename=id=>setRenaming(current=>current===id?null:current);
 async function createCanvas(){if(busy||importLock.current)return;try{await settleEditor();await create();}catch(e){setNotice(e.message);}}
 const editingImage=project?.images.find(image=>image.id===selected);
 const editingValue=project?.edits?.[selected];
 const visibleCanvas=transformCanvas||displayProject?.canvas;
 const imageControls=placement=>editingImage&&<ImageEditor key={editingImage.id} ref={editor} image={editingImage} value={editingValue} placement={placement} open={editing===selected} mode={imageMode} hidden={!active} disabled={busy} onActivate={mode=>{setImageMode(mode);setEditing(selected);}} onPreview={(edit,options)=>setCropDraft(edit?{id:selected,edit,...options}:null)} onCommit={edit=>commitCrop(selected,edit)} splitDraft={splitDraft} onSplitDraft={value=>setSplitDraft(value?{...value,id:selected}:null)} onSplit={(axis,at)=>splitImage(selected,axis,at)} onRemove={()=>removeImage(selected)} onRotate={degrees=>rotateImage(selected,degrees)} onAnglePreview={(angle,revision)=>setAngleDraft(angle==null?null:{id:selected,angle,revision})} onAngleCommit={(angle,revision)=>commitAngle(selected,angle,revision)} onClose={()=>{setAngleDraft(null);setEditing(current=>current===selected?null:current);setCropDraft(current=>current?.id===selected?null:current);setSplitDraft(current=>current?.id===selected?null:current);}}/>;
 return <>
  <input ref={input} type="file" className="sr-only" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择画布图片文件" onChange={e=>importFiles(e.target.files)}/>
  <section className="stage stitch-stage" aria-label="图像编辑工作台">
   <div className="preview-workspace">
    <div className="file-toolbar">
     <input className="project-name" aria-label="项目名称" maxLength="80" value={project?canvasName(project.name):''} disabled={busy||!project} onChange={e=>update({name:e.target.value})}/>
     <div className="preview-actions">
      <span className={`save-status ${saveError?'error':''}`} role="status">{saveError?'未保存':saving?'保存中…':project?'已自动保存':''}</span>
      <CanvasTools project={project} busy={busy} onReset={requestReset} onOptimize={optimize} onSettings={setOptimizationSettings}/>
      <TooltipButton label={inspectorOpen?'收起导出设置':'展开导出设置'} placement="left" className="icon-button panel-toggle stitch-panel-toggle" aria-expanded={inspectorOpen} aria-controls="stitch-export-inspector" onClick={()=>setInspectorOpen(!inspectorOpen)}><SidebarSimple size={23} aria-hidden/></TooltipButton>
     </div>
    </div>
    {project?.images.length?<>
     <div className="canvas-area"><div className="canvas-content"><div className="stitch-editing-surface">
      <StitchCanvas navigationTarget={navigationSlot} navigationDisabled={busy||!!angleDraft} viewportMode={`${inspectorRevision}:${inspectorOpen}`} project={displayProject} layout={layout} preview={!cropDraft&&!splitDraft&&!angleDraft&&output?output.preview:null} selected={selected} onSelect={selectImage} onEdit={editImage} onContext={contextImage} onReorder={reorder} onChange={(positions,operation)=>update(p=>applyCanvasTransform(p,positions,operation))} onResizePreview={setTransformCanvas} renderControls={imageControls} cropping={!!selected&&editing===selected&&imageMode==='crop'&&!splitDraft} rotationOpen={!!selected&&editing===selected&&imageMode==='rotate'} cropGesture={!!cropDraft?.gesture} guides={cropDraft?.guides} split={splitDraft} onSplitChange={value=>setSplitDraft({...value,id:editing})} disabled={busy||!!cropDraft||!!splitDraft||!!angleDraft} splitDisabled={busy}/>
     </div>
     <div className="preview-info stitch-info" aria-live="polite"><span className="canvas-dimensions" title={output?.autoResized?`设置 ${output.requestedWidth} × ${output.requestedHeight}；为满足体积上限已等比调整`:undefined}>{output?`${output.width} × ${output.height}${output.autoResized?' · 等比调整':''}`:visibleCanvas?`${visibleCanvas.width} × ${visibleCanvas.height}`:calculation.error}</span>{layout?.rects.some(r=>r.autoCrop)&&<span>9:16 居中裁切</span>}<span className="canvas-navigation-slot" ref={navigationSlot}/><span className="preview-status" title={output?`${output.bytes.toLocaleString()} 字节${output.difference?`；RGB 最大误差 ${output.difference.maxError}/255，RMSE ${output.difference.rmse.toFixed(4)}；透明度误差 ${output.difference.alphaMaxError}${output.autoResized?'（以实际尺寸的等比缩放图为基准）':''}`:''}`:undefined}>{cropDraft||transformCanvas||angleDraft?'编辑中…':processing?'计算中…':output?`${output.encoding||output.format.toUpperCase()} · ${megabytes(output.bytes)}`:error}</span></div></div></div>
    </>:<div className="canvas-area"><div className="canvas-content"><div className="stitch-editing-surface">{project&&<StitchCanvas navigationTarget={navigationSlot} navigationDisabled={busy||!!angleDraft} viewportMode={`${inspectorRevision}:${inspectorOpen}`} project={project} layout={layout} disabled={busy}><div className="empty-state fixed-empty"><span className="empty-artwork" aria-hidden><img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/></span><button className="primary import-button" aria-label="添加画布图片" disabled={busy} onClick={add}><Plus size={28} weight="bold"/>{loading?'恢复中…':'添加图片'}</button></div></StitchCanvas>}{!project&&<div className="empty-state stitch-create-empty"><img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/><button className="primary import-button" aria-label="新建画布" disabled={busy} onClick={createCanvas}><Plus size={30} weight="bold"/>{loading?'恢复中…':'新建画布'}</button></div>}</div><div className="preview-info stitch-info"><span className="canvas-dimensions">{layout?`${layout.width} × ${layout.height}`:''}</span><span className="canvas-navigation-slot" ref={navigationSlot}/></div></div></div>}
   </div>
   <CanvasCards projects={projects} currentId={project?.id} disabled={busy} onOpen={openCanvas} onCreate={createCanvas} onClear={requestClear} onContext={contextCanvas} exportableIds={exportableIds} exportIds={exportIds} onSelectExport={selectExport} onSelectAll={checked=>setExportSelection(checked?null:[])} renamingId={renaming} onRenameStart={startRename} onRename={renameCanvas} onRenameEnd={endRename}/>
  </section>
  <div className="inspector-shell"><aside className="inspector" id="stitch-export-inspector" aria-label="图像编辑导出设置" aria-hidden={!inspectorOpen} inert={!inspectorOpen}>
   <div className="inspector-heading"><h1>编辑</h1></div>
   <div className="settings-scroll">
    <div className="control-section"><label htmlFor="stitch-target">大小上限</label><div className="target-control"><input id="stitch-target" type="number" min="1" max={unit==='MB'?100:100000} step="1" disabled={busy||!project} value={project?(project.export.targetBytes/(unit==='MB'?1000000:1000)):30} onChange={e=>setExport({targetBytes:Number(e.target.value)*(unit==='MB'?1000000:1000)})}/><Dropdown label="画布大小单位" className="unit-dropdown" value={unit} onChange={setUnit} disabled={busy||!inspectorOpen} options={[{value:'MB',label:'MB'},{value:'KB',label:'KB'}]}/></div></div>
    <div className="control-section"><div className="canvas-settings-heading"><h2>画布</h2><Dropdown id="canvas-preset" label="画布预设" className="canvas-preset" value={canvasPresetValue(visibleCanvas)} options={[...CANVAS_PRESETS,...(canvasPresetValue(visibleCanvas)==='custom'?[{value:'custom',label:'自定义'}]:[])]} disabled={busy||!project||!inspectorOpen} onChange={setPreset}/></div><div className="dimension-inputs stitch-pair"><div className="number-with-unit"><input id="stitch-width" aria-label="画布宽度" type="number" min="1" max="5999" disabled={busy||!project} value={visibleCanvas?.width??''} onChange={e=>setCanvas({width:Number(e.target.value)})}/><span>宽 px</span></div><div className="number-with-unit"><input id="stitch-height" aria-label="画布高度" type="number" min="1" max="5999" disabled={busy||!project} value={visibleCanvas?.height??''} onChange={e=>setCanvas({height:Number(e.target.value)})}/><span>高 px</span></div></div></div>
    <div className="control-section"><h2>布局</h2><div className="layout-options">{[['horizontal','横排'],['grid','宫格'],['vertical','竖排'],['free','自由']].map(([type,label])=><button key={type} data-layout={type} disabled={busy||!project} className={project?.layout===type?'active':''} aria-pressed={project?.layout===type} onClick={()=>setLayout(type)}>{label}</button>)}</div></div>
    <div className="control-section"><label htmlFor="stitch-format">格式</label><Dropdown id="stitch-format" label="画布输出格式" value={explicitFormat(project?.export.format)} onChange={format=>setExport({format})} disabled={busy||!project||!inspectorOpen} options={outputFormats}/></div>
    {project?.layout==='grid'&&<div className="control-section"><h2>行列</h2><div className="dimension-inputs stitch-pair"><div className="number-with-unit"><input aria-label="宫格行数" type="number" min="1" max="100" disabled={busy} value={project.grid.rows} onChange={e=>setGrid({rows:Number(e.target.value)})}/><span>行</span></div><div className="number-with-unit"><input aria-label="每行最多列数" type="number" min="1" max="100" disabled={busy} value={project.grid.columns} onChange={e=>setGrid({columns:Number(e.target.value)})}/><span>列</span></div></div></div>}
   </div>
   <div className="export-section">
    {(saveError||calculation.error&&project||error)&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{saveError||calculation.error||error}</span>{saveError&&<button onClick={retry}>重试</button>}</div>}
    <label>输出文件夹</label><button className="folder-control" disabled={busy} onClick={()=>chooseFolder().catch(e=>setNotice(e.message))}><FolderSimple size={23}/><span>{folder?.name||'选择文件夹'}</span></button>
    <button className="primary export-button" disabled={busy||!!cropDraft||!!splitDraft||!!transformCanvas||!exportIds.length||!!saveError||exportIds.includes(project?.id)&&!!project?.images.length&&(!layout||!!calculation.error||!!error)} onClick={()=>exportProjects(exportIds)}>{batch?<><SpinnerGap className="spin" size={23}/>导出 {batch.current} / {batch.total}</>:`导出 ${exportIds.length} 张图像`}</button>
    <div className="export-secondary">{batch&&<button className="cancel-button" onClick={()=>{cancel.current=true;}}>取消后续</button>}</div>
   </div>
  </aside></div>
  {context&&active&&<ContextMenu anchor={context.anchor} onClose={()=>setContext(null)} items={context.type==='image'?[
   {label:'编辑图片',icon:PencilSimple,action:()=>editImage(context.id,context.anchor)},
   {label:'删除图片',icon:Trash,danger:true,action:()=>removeImage(context.id)}
  ]:[
   {label:'导出此图像',icon:Export,action:()=>exportProjects([context.id])},
   {label:'重命名',icon:PencilSimple,action:()=>startRename(context.id)},
   {label:'删除画布',icon:Trash,danger:true,action:()=>requestRemoveCanvas(context.id)}
  ]}/>}
  {confirmation&&<ConfirmDialog request={confirmation} onCancel={()=>setConfirmation(null)} onConfirm={confirm}/>}
  {optimization&&<OptimizeDialog state={optimization} onClose={()=>setOptimization(null)}/>}
  {notice&&active&&<div className="notice" role="status"><CheckCircle size={23}/><span>{notice}</span><button className="icon-button" aria-label="关闭编辑提示" onClick={()=>setNotice('')}><X size={18}/></button></div>}
 </>;
});
