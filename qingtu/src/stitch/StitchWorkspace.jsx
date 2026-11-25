import {AspectRatioButton} from '../AspectRatioButton.jsx';
import {MAX_EDGE} from '../../engine/canvas-limits.mjs';
import {forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Plus,FolderOpen,X,PencilSimple,Trash,Export,SpinnerGap,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {api,desktop} from '../api.js';
import {OutputFolder,useOutputFolder} from '../OutputFolder.jsx';
import {originalCanvasImage,stitchRenderKey} from '../../engine/stitch-render-input.mjs';
import {PreviewCache} from '../../engine/preview-cache.mjs';
import {PreviewMetrics} from '../PreviewMetrics.jsx';
import {originalBytes} from '../../engine/image-source.mjs';
import {usePngBudgetRange} from '../usePngBudgetRange.js';
import {useSuccessTimeout} from '../useSuccessTimeout.js';
import {Dropdown} from '../Dropdown.jsx';
import {InspectorHeading,InspectorToggle} from '../InspectorHeading.jsx';
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
import {nameOrDefault} from '../../engine/output-name.mjs';
import {addFlushHandler} from '../lifecycle.js';
import {outputFormats,explicitFormat} from '../export-format.js';
import {CanvasTools} from './CanvasTools.jsx';
import {ContextMenu} from './ContextMenu.jsx';
import {ConfirmDialog,OptimizeDialog} from './ActionDialogs.jsx';
import {performOptimization} from './optimization.js';
import {exportProjectIds} from './project-export.js';
import {splitProjectImage,fullSourcePosition} from '../../engine/stitch-split.mjs';
import {switchCanvasLayout} from '../../engine/canvas-layout-state.mjs';
import {CANVAS_PRESETS,currentCanvasPreset,originalCanvas,selectCanvasPreset,editCanvasDimension,toggleCanvasRatio} from '../../engine/canvas-presets.mjs';
import {prepareLayoutPreview} from './layout-preview.js';
import {applyCanvasTransform} from '../../engine/canvas-transform.mjs';
import {reorderCanvas} from '../../engine/canvas-order.mjs';
import {rotateProjectImage,setProjectImageAngle} from '../../engine/image-rotation.mjs';
import {rotatePreview} from './rotate-preview.js';
import {hasImageColor,setImageColors} from '../../engine/image-color.mjs';
import {ColorInspector} from './ColorInspector.jsx';
import {colorsFromReference,resolveColorReference} from './color-preview.js';

export const StitchWorkspace=forwardRef(function StitchWorkspace({active,inspectorOpen,inspectorRevision,setInspectorOpen,onBusy,onCount},ref){
 const {projects,project,update,travel,open,leaveProject,create,remove,clear,loading,saving,saveError,flush,retry,conflict,getCurrent}=useProjects();
 const [editing,setEditing]=useState(null),[imageMode,setImageMode]=useState('crop'),[cropDraft,setCropDraft]=useState(null),[splitDraft,setSplitDraft]=useState(null),[transformCanvas,setTransformCanvas]=useState(null),[angleDraft,setAngleDraft]=useState(null),editor=useRef(),navigationSlot=useRef();
 const [selected,setSelected]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[importing,setImporting]=useState(false),[batch,setBatch]=useState(null),[output,setOutput]=useState(null),[processing,setProcessing]=useState(false);
 useSuccessTimeout(notice,setNotice);
 const folder=useOutputFolder('stitch',text=>setNotice({type:'error',text}));
 const [context,setContext]=useState(null),[confirmation,setConfirmation]=useState(null),[optimization,setOptimization]=useState(null),[optimizing,setOptimizing]=useState(false),[splitting,setSplitting]=useState(false),[rotating,setRotating]=useState(false);
 const [viewRevision,setViewRevision]=useState(0);
 const [grading,setGrading]=useState(false),[colorBefore,setColorBefore]=useState(false);
 const [colorDraft,setColorDraft]=useState(null),colorGesture=useRef(null);
 const [matching,setMatching]=useState(false),matchingLock=useRef(false),[matchMessage,setMatchMessage]=useState(null);
 const colorMode=grading&&!!project?.images.length;
 const colorReference=resolveColorReference(project);
 const canCompareColor=project?.images.some(image=>hasImageColor(image.color));
 useEffect(()=>{setColorBefore(false);setMatchMessage(null);},[project?.id]);
 useEffect(()=>{if(!canCompareColor)setColorBefore(false);},[canCompareColor]);
 const fieldSession=useRef(null),renameInput=useRef(null);
 const [blankTitle,setBlankTitle]=useState(null);
 useEffect(()=>setBlankTitle(null),[active,project?.id]);
 function editTitle(event){
  const value=event.target.value;
  setBlankTitle(value.trim()?null:value);
  return update({name:nameOrDefault(value,project.defaultName)},inputGroup(event));
 }
 function inputGroup(event){
  if(fieldSession.current?.field!==event.target)fieldSession.current={field:event.target};
  return fieldSession.current;
 }
 function finishInput(){fieldSession.current=null;}
 const [exportSelection,setExportSelection]=useState(null);
 const [renaming,setRenaming]=useState(null),[choosingImage,setChoosingImage]=useState(false),[changingEntry,setChangingEntry]=useState(false);
 useEffect(()=>{if(project)setChoosingImage(false);},[project?.id]);
 const unit=project?.export.unit||'MB',setUnit=unit=>setExport({unit});
 useEffect(()=>{setSelected(project?.images[0]?.id||null);setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);},[project?.id]);
 const input=useRef(),cancel=useRef(false),exportTask=useRef(Promise.resolve()),importTask=useRef(Promise.resolve()),actionTask=useRef(Promise.resolve()),optimizeTask=useRef(Promise.resolve()),splitTask=useRef(Promise.resolve()),importLock=useRef(false),exportLock=useRef(false),previewCache=useRef(null),renders=useRef(new Map()),optimizationFailure=useRef(null);
 if(!previewCache.current)previewCache.current=new PreviewCache();
 const renderKey=useMemo(()=>project&&stitchRenderKey(project),[project]);
 const previewTasks=useRef(new Set()),previewTimer=useRef(),flushing=useRef(false);
 const splitLock=useRef(false),removeLock=useRef(false),rotationLock=useRef(false);
 const displayProject=useMemo(()=>{
  if(splitDraft&&project?.images.some(image=>image.id===splitDraft.id)){const edits={...project.edits};delete edits[splitDraft.id];return {...project,edits,positions:{...project.positions,[splitDraft.id]:fullSourcePosition(project,splitDraft.id)}};}
  const cropped=cropDraft?setImageEdit(project,cropDraft.id,cropDraft.edit):project;
  const rotated=angleDraft&&cropped?setProjectImageAngle(cropped,angleDraft.id,angleDraft.angle):cropped;
  return colorDraft&&rotated?.id===colorDraft.projectId?setImageColors(rotated,new Map([[colorDraft.id,colorDraft.color]])):rotated;
 },[project,cropDraft,splitDraft?.id,angleDraft,colorDraft]);
 const calculation=useMemo(()=>{try{return {layout:calculateLayout(displayProject||{})};}catch(e){try{return {layout:calculateLayout(displayProject||{},{draft:true}),error:e.message};}catch{return {error:e.message};}}},[displayProject]);
 const {layout}=calculation;
 const pngRange=usePngBudgetRange(project?.export.format==='png'&&project.canvas&&!(originalCanvasImage(project,layout)?.format==='png')?[project.canvas]:[],project?.export.targetBytes);

 const busy=loading||changingEntry||importing||!!batch||optimizing||splitting||rotating||matching||!!confirmation||!!optimization;
 const exportableIds=exportProjectIds(projects,project),exportIds=exportProjectIds(projects,project,exportSelection);
 function selectExport(id,checked){setExportSelection(previous=>{const ids=exportProjectIds(projects,getCurrent(),previous);return checked?[...ids,id]:ids.filter(value=>value!==id);});}
 useEffect(()=>setContext(null),[active,project?.id,busy]);
 useEffect(()=>{onBusy(busy||saving||processing||!!saveError||!!cropDraft||!!splitDraft||!!transformCanvas||!!angleDraft||!!colorDraft);onCount(project?.images.length||0);},[busy,saving,processing,saveError,cropDraft,splitDraft,transformCanvas,angleDraft,!!colorDraft,project?.images.length]);
 useEffect(()=>{
  const removeSelected=event=>{
   if(!active||busy||colorMode||renaming||transformCanvas||cropDraft?.gesture||!selected||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!['Delete','Backspace'].includes(event.key))return;
   if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
   if(!getCurrent()?.images.some(image=>image.id===selected))return;
   event.preventDefault();removeImage(selected);
  };
  window.addEventListener('keydown',removeSelected);return()=>window.removeEventListener('keydown',removeSelected);
 },[active,busy,colorMode,renaming,transformCanvas,cropDraft?.gesture,selected,project?.id]);
 function clearColorDraft(){
  colorGesture.current=null;setColorDraft(null);
 }
 function previewColor(id,color){
  const current=getCurrent();
  if(!current?.images.some(image=>image.id===id))return;
  const draft={projectId:current.id,id,color};
  colorGesture.current=draft;setColorDraft(draft);setColorBefore(false);
 }
 function commitColorDraft(){
  const draft=colorGesture.current;
  if(!draft)return Promise.resolve();
  clearColorDraft();
  if(getCurrent()?.id!==draft.projectId)return Promise.resolve();
  return update(p=>setImageColors(p,new Map([[draft.id,draft.color]]))).catch(error=>setNotice(error.message));
 }
 async function flushEditor(){await editor.current?.flush();await commitColorDraft();}
 async function setGradingMode(value){
  if(value===colorMode)return;
  try{
   await settleEditor();
   setGrading(value);setColorBefore(false);setMatchMessage(null);
   if(value){
    setInspectorOpen(true);
    if(!selected)setSelected(getCurrent()?.images[0]?.id||null);
   }
  }catch(error){setNotice(error.message);}
 }
 function applyColorEdits(changes){
  const task=(async()=>{
   await commitColorDraft();setColorBefore(false);setMatchMessage(null);
   await update(p=>setImageColors(p,changes));
  })().catch(error=>setNotice(error.message));
  actionTask.current=task;return task;
 }
 function saveColorReference(reference,owner){
  if(getCurrent()?.id!==owner)throw new Error('画布已切换，请重新选择参考图');
  setMatchMessage(null);
  return update({colorReference:reference});
 }
 function chooseColorReference(reference){
  const owner=getCurrent()?.id;
  actionTask.current=Promise.resolve().then(()=>saveColorReference(reference,owner))
   .catch(error=>setMatchMessage({error:true,text:error.message}));
 }
 function importColorReference(file){
  const owner=getCurrent()?.id;
  const task=repository.importReference(file).then(reference=>saveColorReference(reference,owner));
  actionTask.current=task.catch(()=>{});
  return task;
 }
 function matchColors(ids,options){
  if(busy||matchingLock.current)return actionTask.current;
  matchingLock.current=true;setMatching(true);setMatchMessage(null);setColorBefore(false);
  const task=(async()=>{
   await commitColorDraft();
   const current=getCurrent(),reference=resolveColorReference(current);
   const targets=current?.images.filter(image=>image.id!==reference?.id&&ids.includes(image.id));
   if(!reference||!targets?.length)return;
   const changes=await colorsFromReference(reference,targets,options);
   if(getCurrent()!==current)throw new Error('画布已更新，请重新克隆色彩');
   await update(p=>setImageColors(p,changes));
   setMatchMessage({text:`已克隆到 ${targets.length} 张图片`});
  })().catch(error=>setMatchMessage({error:true,text:error.message})).finally(()=>{
   matchingLock.current=false;setMatching(false);
  });
  actionTask.current=task;return task;
 }
 useEffect(()=>{if(!active)flushEditor().then(()=>{setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);}).catch(()=>{});},[active]);
 useEffect(()=>addFlushHandler(async()=>{flushing.current=true;clearTimeout(previewTimer.current);try{await flushEditor();await importTask.current;await exportTask.current;await optimizeTask.current;await splitTask.current;await actionTask.current;await Promise.allSettled([...previewTasks.current]);await flush();}finally{flushing.current=false;}}),[]);
 useLayoutEffect(()=>{
  if(!active){setProcessing(false);return;}
  const editing=!!(cropDraft||splitDraft||transformCanvas||angleDraft||colorDraft);
  const cached=renderKey&&previewCache.current.get(renderKey);
  if(cached&&!editing){setOutput(cached);setError('');setProcessing(false);return;}
  setOutput(null);setError('');
  if(optimizationFailure.current?.key===renderKey){setError(optimizationFailure.current.message);setProcessing(false);return;}
  if(pngRange.message){setError(pngRange.message);setProcessing(false);return;}
  if(!project?.images.length||!layout||calculation.error||busy||editing||flushing.current){setProcessing(false);return;}
  setProcessing(true);
  if(pngRange.checking)return;
  let live=true;
  const timer=previewTimer.current=setTimeout(()=>{
   const pending=renders.current.get(project.id);
   let task=pending?.key===renderKey?pending.task:null;
   if(!task){
    task=api.stitchRender(project,{latest:true}).then(result=>{
     previewCache.current.set(renderKey,result,2*result.preview.length);
     return result;
    }).finally(()=>{if(renders.current.get(project.id)?.task===task)renders.current.delete(project.id);previewTasks.current.delete(task);});
    renders.current.set(project.id,{key:renderKey,task});previewTasks.current.add(task);
   }
   task.then(result=>{if(live)setOutput(result);}).catch(e=>{if(live&&!e.message.includes('预览参数已更新'))setError(e.message);}).finally(()=>{if(live)setProcessing(false);});
  },500);
  return()=>{live=false;clearTimeout(timer);};
 },[active,renderKey,busy,!!cropDraft,!!splitDraft,!!transformCanvas,!!angleDraft,!!colorDraft,pngRange.message,pngRange.checking]);
 async function settleEditor(){await flushEditor();setEditing(null);setCropDraft(null);setSplitDraft(null);setAngleDraft(null);}
 async function selectImage(id){try{if(editing&&editing!==id)await settleEditor();setSelected(id);}catch(error){setNotice(error.message);}}
 async function editImage(id){try{if(editing!==id)await settleEditor();setSelected(id);setImageMode('crop');setEditing(id);}catch(e){setNotice(e.message);}}
 function commitCrop(id,edit){setCropDraft(null);return update(p=>setImageEdit(p,id,edit));}
 async function runOptimize(){
  let phase='calculate';
  try{await settleEditor();const current=getCurrent(),cached=previewCache.current.get(stitchRenderKey(current));optimizationFailure.current=null;
   const value=await performOptimization({project:current,save:update,preparePreview:prepareLayoutPreview,reuse:cached,onPhase:next=>{phase=next;setOptimization({phase:next});}});
   if(!value.layoutOnly)previewCache.current.set(stitchRenderKey(getCurrent()),value.result,2*value.result.preview.length);setOutput(value.layoutOnly?null:value.result);setError('');setProcessing(false);setOptimization(null);
  }catch(e){if(phase==='render'){optimizationFailure.current={key:stitchRenderKey(getCurrent()),message:e.message};setError(e.message);}setOptimization({phase:'error',failedAt:phase,message:e.message});}
  finally{setOptimizing(false);}
 }
 function optimize(){if(busy)return;setOptimizing(true);setOptimization({phase:'prepare'});const task=runOptimize();optimizeTask.current=task;return task;}
 function setOptimizationSettings(settings){
  return update({optimization:settings});
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
 function canvasCommand(command){
  const owner=getCurrent()?.id;
  if(!active||!owner||busy||transformCanvas||cropDraft?.gesture||document.querySelector('.stitch-canvas[data-interacting], [data-panning]'))return;
  const task=actionTask.current.catch(()=>{}).then(async()=>{
   if(getCurrent()?.id!==owner)return;
   await settleEditor();
   if(getCurrent()?.id!==owner)return;
   if(command==='reset'){
    const current=getCurrent();
    let reset=resetProject(current);
    if(reset.images.some(image=>!image.preview))reset=await repository.prepare(reset);
    if(getCurrent()!==current)return;
    const saved=update(()=>reset);
    setViewRevision(revision=>revision+1);
    setSelected(id=>reset.images.some(image=>image.id===id)?id:null);
    await saved;
    if(getCurrent()?.id===owner)setNotice({type:'success',text:'已重置画布，视图已恢复至 100%'});
   }else{
    await travel(command);setContext(null);setNotice('');
    setSelected(id=>getCurrent()?.images.some(image=>image.id===id)?id:null);
   }
  }).catch(e=>setNotice({type:'error',text:e.message}));
  actionTask.current=task;return task;
 }
 function requestRemoveCanvas(id){const value=projects.find(p=>p.id===id);if(value)setConfirmation({kind:'remove',id,title:'删除这个画布？',description:canvasName(value.name),danger:true,label:'删除'});}
 function requestClear(){setConfirmation({kind:'clear',title:'删除全部画布？',description:`删除 ${projects.length} 个画布项目，原始文件保留。`,danger:true,label:'全部删除'});}
 async function runConfirmed(){
  const request=confirmation;await settleEditor();
  if(request.kind==='remove')await remove(request.id);
  else await clear();
  setConfirmation(null);
 }
 function confirm(){const task=runConfirmed();actionTask.current=task.catch(()=>{});return task;}
 async function contextImage(id,anchor){if(busy)return;try{await settleEditor();setSelected(id);setContext({type:'image',id,anchor});}catch(e){setNotice(e.message);}}
 function contextCanvas(id,anchor){if(!busy)setContext({type:'canvas',id,anchor});}
 async function accept(items,owner,originals,group,singleSource=items.length===1){
  if(!items.length)return owner;
  if(getCurrent()?.id!==owner)throw new Error('当前画布已切换，请重新导入');
  repository.rememberImports(items);
  if(owner)await update(p=>importCanvasImages(p,items,{useSourceSize:singleSource}),group);
  else owner=(await create(items,originals,group,singleSource)).id;
  setViewRevision(revision=>revision+1);setSelected(items[0].id);
  return owner;
 }
 async function runImportFiles(files){
  const list=Array.from(files);let owner=getCurrent()?.id;
  const originals=owner?undefined:new Map(),group=Symbol();
  importLock.current=true;setImporting(true);setNotice('');
  try{
   await settleEditor();const errors=[];
   for(const file of list){
    let item;try{item=await repository.import(file,originals);}catch(e){errors.push(`${file.name}：${e.message}`);continue;}
    owner=await accept([item],owner,originals,group,list.length===1);
   }
   if(errors.length)setNotice(`已导入 ${list.length-errors.length} 张，${errors.join('；')}`);
  }catch(e){setNotice(e.message);}finally{importLock.current=false;setImporting(false);if(input.current)input.current.value='';}
 }
 function importFiles(files){if(busy||importLock.current||!files.length)return importTask.current;const task=runImportFiles(files);importTask.current=task;return task;}
 async function chooseDesktopImages(){
  const owner=getCurrent()?.id;importLock.current=true;setImporting(true);setNotice('');
  try{
   await settleEditor();
   const result=await api.stitchChooseFiles(owner||choosingImage?'add':'open');
   await accept(result.items,owner);
   if(result.errors.length)setNotice(result.errors.join('；'));
  }catch(e){setNotice(e.message);}finally{importLock.current=false;setImporting(false);}
 }
 function add(){
  if(busy||importLock.current)return importTask.current;
  if(!desktop){input.current.click();return;}
  const task=chooseDesktopImages();importTask.current=task;return task;
 }
 async function runExport(ids){
  if(busy||splitDraft||!ids.length||ids.includes(project?.id)&&(pngRange.message||pngRange.checking))return;
  cancel.current=false;setBatch({current:0,total:ids.length});let success=0;const failures=[];
  try{
   const destination=await folder.prepare();if(!destination)return;
   await renameInput.current?.flush();await flushEditor();await flush();const current=getCurrent();setNotice('');
   for(let n=0;n<ids.length;n++){
    if(cancel.current)break;setBatch({current:n+1,total:ids.length});
    try{let snapshot=ids[n]===current?.id?structuredClone(current):await repository.load(ids[n]);snapshot.export={...snapshot.export,format:explicitFormat(snapshot.export?.format)};snapshot=await repository.prepare(snapshot,{previews:false});const result=await api.stitchRender(snapshot);await folder.save(result.token,destination);success++;}
    catch(e){failures.push(`${canvasName(projects.find(p=>p.id===ids[n])?.name)}：${e.message}`);}
   }
   setNotice({type:failures.length?'error':'success',reveal:success>0&&desktop,text:`已导出 ${success} 张图像${failures.length?'；'+failures.join('；'):cancel.current?'，已取消':''}`});
  }finally{setBatch(null);}
 }
 function exportProjects(ids){if(busy||exportLock.current||!ids.length)return exportTask.current;exportLock.current=true;const task=runExport(ids).catch(e=>setNotice(e.message)).finally(()=>{exportLock.current=false;});exportTask.current=task;return task;}
 useImperativeHandle(ref,()=>({add,importFiles,canvasCommand,export:()=>exportProjects(exportIds)}));
 async function setLayout(type){
  try{await settleEditor();if(getCurrent()?.layout!==type)await update(p=>switchCanvasLayout(p,type));}catch(e){setNotice(e.message);}
 }
 async function setGrid(changes,group){try{await settleEditor();await update(p=>{const grid={...p.grid,...changes};try{return p.canvasSizing==='content'?arrangeContentImages(p,'grid',grid):arrangeImages(p,'grid',grid);}catch(e){if(e.message.includes('行列'))return {...p,grid};throw e;}},group);}catch(e){setNotice(e.message);}}
 function editDimension(field,event){
  const value=event.target.value;
  const before=getCurrent()?.canvas;
  const saved=update(p=>editCanvasDimension(p,field,value),inputGroup(event));
  const after=getCurrent()?.canvas;
  if(after?.width>0&&after.height>0&&(before?.width!==after.width||before?.height!==after.height))setViewRevision(revision=>revision+1);
  return saved;
 }
 async function setPreset(value){
  const owner=getCurrent()?.id;
  try{
   await settleEditor();
   if(getCurrent()?.id!==owner)return;
   const saved=update(p=>selectCanvasPreset(p,value));
   setViewRevision(revision=>revision+1);
   await saved;
  }catch(e){setNotice(e.message);}
 }
 const setExport=(changes,group)=>update(p=>({...p,export:{...p.export,...changes}}),group);
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
  const task=Promise.resolve().then(()=>{if(getCurrent()?.id!==id)throw new Error('画布已切换，请重新命名');return update({name:nameOrDefault(name,getCurrent().defaultName)});});
  actionTask.current=task.catch(()=>{});return task;
 }
 const endRename=id=>setRenaming(current=>current===id?null:current);
 function startImage(action){
  if(busy||importLock.current)return;
  importLock.current=true;setChangingEntry(true);
  const task=(async()=>{
   await settleEditor();
   if(action==='blank')await create();
   else {await leaveProject();setChoosingImage(true);}
  })().catch(e=>setNotice(e.message)).finally(()=>{importLock.current=false;setChangingEntry(false);});
  actionTask.current=task;return task;
 }
 const editingImage=project?.images.find(image=>image.id===selected);
 const editingValue=project?.edits?.[selected];
 const visibleCanvas=transformCanvas||displayProject?.canvas,original=originalCanvas(project);
 const presetOptions=[...(original?[{value:'original',label:'原图比例'}]:[]),...CANVAS_PRESETS,{value:'custom',label:'自定义'}];
 const imageControls=placement=>editingImage&&<ImageEditor key={editingImage.id} ref={editor} image={editingImage} value={editingValue} placement={placement} open={editing===selected} mode={imageMode} hidden={!active} disabled={busy} onActivate={mode=>{setImageMode(mode);setEditing(selected);}} onPreview={(edit,options)=>setCropDraft(edit?{id:selected,edit,...options}:null)} onCommit={edit=>commitCrop(selected,edit)} splitDraft={splitDraft} onSplitDraft={value=>setSplitDraft(value?{...value,id:selected}:null)} onSplit={(axis,at)=>splitImage(selected,axis,at)} onRemove={()=>removeImage(selected)} onRotate={degrees=>rotateImage(selected,degrees)} onAnglePreview={(angle,revision)=>setAngleDraft(angle==null?null:{id:selected,angle,revision})} onAngleCommit={(angle,revision)=>commitAngle(selected,angle,revision)} onClose={()=>{setAngleDraft(null);setEditing(current=>current===selected?null:current);setCropDraft(current=>current?.id===selected?null:current);setSplitDraft(current=>current?.id===selected?null:current);}}/>;
 return <>
  <input ref={input} type="file" className="sr-only" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择画布图片文件" onChange={e=>importFiles(e.target.files)}/>
  <section className="stage stitch-stage" onBlurCapture={finishInput} aria-label="图像编辑工作台">
   <div className="preview-workspace">
    <div className="file-toolbar stitch-file-toolbar" data-with-modes={!!project?.images.length||undefined} data-color-mode={colorMode||undefined}>
     <input className="project-name" aria-label="项目名称" maxLength="80" value={project?(blankTitle??project.name):''} disabled={busy||!project} onChange={editTitle} onBlur={()=>setBlankTitle(null)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){setBlankTitle(null);e.currentTarget.blur();}}}/>
     {!!project?.images.length&&<div className="view-switch stitch-mode-switch" role="group" aria-label="编辑模式">
      <button type="button" className={!colorMode?'active':''} aria-pressed={!colorMode} disabled={busy} onClick={()=>setGradingMode(false)}>布局</button>
      <button type="button" className={colorMode?'active':''} aria-pressed={colorMode} disabled={busy} onClick={()=>setGradingMode(true)}>调色</button>
     </div>}
     <div className="preview-actions">
      <span className={`save-status ${saveError?'error':''}`} role="status">{saveError?'未保存':saving?'保存中…':project?'已自动保存':''}</span>
      {colorMode?<div className="view-switch color-view-switch" role="group" aria-label="调色预览方式">
       <button type="button" className={colorBefore?'active':''} aria-pressed={colorBefore} aria-label="查看原图" disabled={!canCompareColor||busy} onClick={()=>setColorBefore(true)}>原图</button>
       <button type="button" className={!colorBefore?'active':''} aria-pressed={!colorBefore} aria-label="查看处理后图片" disabled={!canCompareColor||busy} onClick={()=>setColorBefore(false)}>处理后</button>
      </div>:<CanvasTools project={project} busy={busy} onReset={()=>canvasCommand('reset')} onOptimize={optimize} onSettings={setOptimizationSettings}/>}
      {!inspectorOpen&&<InspectorToggle panelId="stitch-export-inspector" expanded={false} setOpen={setInspectorOpen} settingsName={colorMode?"调色设置":undefined}/>}
     </div>
    </div>
    {project?.images.length?<>
     <div className="canvas-area stitch-image-area"><div className="canvas-content"><div className="stitch-editing-surface">
      <StitchCanvas viewRevision={viewRevision} navigationTarget={navigationSlot} navigationDisabled={busy||!!angleDraft} viewportMode={`${inspectorRevision}:${inspectorOpen}`} project={displayProject} layout={layout} preview={!colorMode&&!cropDraft&&!splitDraft&&!angleDraft&&output?output.preview:null} selected={selected} onSelect={selectImage} onEdit={editImage} onContext={contextImage} onReorder={reorder} onChange={(positions,operation)=>update(p=>applyCanvasTransform(p,positions,operation))} onResizePreview={setTransformCanvas} renderControls={colorMode?null:imageControls} colorMode={colorMode} showOriginal={colorMode&&colorBefore} colorReference={colorReference?.id} cropping={!!selected&&editing===selected&&imageMode==='crop'&&!splitDraft} rotationOpen={!!selected&&editing===selected&&imageMode==='rotate'} cropGesture={!!cropDraft?.gesture} split={splitDraft} onSplitChange={value=>setSplitDraft({...value,id:editing})} disabled={busy||!!cropDraft||!!splitDraft||!!angleDraft} splitDisabled={busy}/>
     </div>
     <div className="preview-info stitch-info" aria-live="polite">
      <PreviewMetrics dimensionLabel={layout?.rects.some(r=>r.autoCrop)?'画布 · 9:16 居中裁切':'画布'} dimensions={visibleCanvas||layout||output} sources={project.images} sourceBytes={originalBytes(project.images)} output={output} processing={processing} status={cropDraft||splitDraft||transformCanvas||angleDraft||colorDraft?'编辑中…':undefined} multiple={project.images.length>1} selectedImage={editingImage}/>
      {!visibleCanvas&&!layout&&!output&&calculation.error&&<span>{calculation.error}</span>}

      <span className="canvas-navigation-slot" ref={navigationSlot}/>
     </div></div></div>
    </>:<div className="canvas-area"><div className="canvas-content"><div className="stitch-editing-surface">{project&&<StitchCanvas viewRevision={viewRevision} navigationTarget={navigationSlot} navigationDisabled={busy||!!angleDraft} viewportMode={`${inspectorRevision}:${inspectorOpen}`} project={project} layout={layout} disabled={busy}><div className="empty-state fixed-empty"><span className="empty-artwork" aria-hidden><img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/></span><button className="primary import-button" aria-label="添加画布图片" disabled={busy} onClick={add}><Plus size={28} weight="bold"/>{loading?'恢复中…':'添加图片'}</button></div></StitchCanvas>}{!project&&<div className="empty-state stitch-create-empty">
       <img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/>
       <div className="stitch-start-actions">
        <button type="button" className="primary import-button" disabled={busy} onClick={add}><FolderOpen size={24} weight="bold" aria-hidden/>{loading?'恢复中…':importing?'正在打开…':choosingImage?'添加图片':'打开图片'}</button>
        <button type="button" className="blank-canvas-button" disabled={busy} onClick={()=>startImage('blank')}>新建空白画布</button>
       </div>
      </div>}</div><div className="preview-info stitch-info"><PreviewMetrics dimensionLabel="画布" dimensions={project&&layout}/><span className="canvas-navigation-slot" ref={navigationSlot}/></div></div></div>}
   </div>
   <CanvasCards projects={projects} currentId={project?.id} disabled={busy} onOpen={openCanvas} onCreate={()=>startImage('choose')} onClear={requestClear} onContext={contextCanvas} exportableIds={exportableIds} exportIds={exportIds} onSelectExport={selectExport} onSelectAll={checked=>setExportSelection(checked?null:[])} renamingId={renaming} renameInput={renameInput} onRenameStart={startRename} onRename={renameCanvas} onRenameEnd={endRename}/>
  </section>
  <div className="inspector-shell"><aside className="inspector" id="stitch-export-inspector" onBlurCapture={finishInput} aria-label={colorMode?"图像调色设置":"图像编辑导出设置"} aria-hidden={!inspectorOpen} inert={!inspectorOpen}>
   <InspectorHeading title={colorMode?"调色":"设置"} panelId="stitch-export-inspector" setOpen={setInspectorOpen} settingsName={colorMode?"调色设置":undefined}/>
   {colorMode?<ColorInspector key={project.id} images={project.images} selected={selected} draft={colorDraft}
    onDraft={previewColor} onCommit={commitColorDraft} onCancel={clearColorDraft}
    onChange={applyColorEdits} onMatch={matchColors} matching={matching} matchMessage={matchMessage}
    reference={colorReference} onReference={chooseColorReference} onImportReference={importColorReference} disabled={busy||!inspectorOpen}/>:<div className="settings-scroll">
    <div className="control-section"><label htmlFor="stitch-target">大小上限</label><div className="target-control"><input id="stitch-target" aria-describedby={pngRange.message?'stitch-png-range':undefined} type="number" min={unit==='KB'?pngRange.minimum:1} max={unit==='MB'?100:100000} step="1" disabled={busy||!project} value={project?(project.export.targetBytes/(unit==='MB'?1000000:1000)):30} onChange={e=>setExport({targetBytes:Number(e.target.value)*(unit==='MB'?1000000:1000)},inputGroup(e))}/><Dropdown label="画布大小单位" className="unit-dropdown" minMenuWidth={0} value={unit} onChange={setUnit} disabled={busy||!project||!inspectorOpen} options={[{value:'MB',label:'MB'},{value:'KB',label:'KB'}]}/></div>{pngRange.message&&<small id="stitch-png-range" className="png-budget-range" role="status">{pngRange.message}</small>}
    </div>
    <div className="control-section"><div className="canvas-settings-heading"><h2>画布</h2><Dropdown id="canvas-preset" label="画布预设" className="canvas-preset" value={currentCanvasPreset(project,visibleCanvas)} options={presetOptions} disabled={busy||!project||!inspectorOpen} onChange={setPreset}/></div><div className="dimension-inputs canvas-dimensions"><div className="number-with-unit"><input id="stitch-width" aria-label="画布宽度" type="number" min="1" max={MAX_EDGE} disabled={busy||!project} value={visibleCanvas?.width||''} onChange={e=>editDimension('width',e)}/><span>px</span></div>
     <AspectRatioButton subject="画布" locked={project?.canvasControls?.locked!==false} disabled={busy||!project} onClick={()=>update(toggleCanvasRatio)}/>
     <div className="number-with-unit"><input id="stitch-height" aria-label="画布高度" type="number" min="1" max={MAX_EDGE} disabled={busy||!project} value={visibleCanvas?.height||''} onChange={e=>editDimension('height',e)}/><span>px</span></div></div></div>
    <div className="control-section"><h2>布局</h2><div className="layout-options">{[['horizontal','横排'],['grid','宫格'],['vertical','竖排'],['free','自由']].map(([type,label])=><button key={type} data-layout={type} disabled={busy||!project} className={project?.layout===type?'active':''} aria-pressed={project?.layout===type} onClick={()=>setLayout(type)}>{label}</button>)}</div></div>
    <div className="control-section"><label htmlFor="stitch-format">格式</label><Dropdown id="stitch-format" label="画布输出格式" value={explicitFormat(project?.export.format)} onChange={format=>setExport({format})} disabled={busy||!project||!inspectorOpen} options={outputFormats}/></div>
    {project?.layout==='grid'&&<div className="control-section"><h2>行列</h2><div className="dimension-inputs stitch-pair"><div className="number-with-unit"><input aria-label="宫格行数" type="number" min="1" max="100" disabled={busy} value={project.grid.rows} onChange={e=>setGrid({rows:Number(e.target.value)},inputGroup(e))}/><span>行</span></div><div className="number-with-unit"><input aria-label="每行最多列数" type="number" min="1" max="100" disabled={busy} value={project.grid.columns} onChange={e=>setGrid({columns:Number(e.target.value)},inputGroup(e))}/><span>列</span></div></div></div>}
   </div>}
   <div className="export-section">
    {(saveError||calculation.error&&project||error&&error!==pngRange.message)&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{saveError||calculation.error||error}</span>{saveError&&<button disabled={busy||saving} onClick={retry}>{conflict?'另存为副本':'重试'}</button>}</div>}
    <OutputFolder folder={folder} disabled={busy}/>
    <button className="primary export-button" disabled={busy||exportIds.includes(project?.id)&&(!!pngRange.message||pngRange.checking)||!!cropDraft||!!splitDraft||!!transformCanvas||!exportIds.length||!!saveError||exportIds.length===1&&exportIds.includes(project?.id)&&!!project?.images.length&&(!layout||!!calculation.error||!!error)} onClick={()=>exportProjects(exportIds)}>{batch?<><SpinnerGap className="spin" size={23}/>导出 {batch.current} / {batch.total}</>:`导出 ${exportIds.length} 张图像`}</button>
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
  {notice&&active&&<div className={`notice ${notice.type||''}`} role={notice.type==='error'?'alert':'status'}>{notice.type==='error'?<WarningCircle size={23}/>:<CheckCircle size={23}/>}<span>{notice.text??notice}</span>{notice.reveal&&<button onClick={folder.reveal}>打开文件夹</button>}<button className="icon-button" aria-label="关闭编辑提示" onClick={()=>setNotice('')}><X size={18}/></button></div>}
 </>;
});
