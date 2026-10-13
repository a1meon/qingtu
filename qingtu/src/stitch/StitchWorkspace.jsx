import {forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {Plus,X,Trash,SidebarSimple,FolderSimple,SpinnerGap,ArrowLeft,ArrowRight,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import {api,desktop} from '../api.js';
import {Dropdown} from '../Dropdown.jsx';
import {TooltipButton} from '../TooltipButton.jsx';
import {calculateLayout,moveImage,appendFreeImages,initializeFree} from '../../engine/stitch-layout.mjs';
import {repository} from './repository.js';
import {useProjects} from './useProjects.js';
import {StitchCanvas} from './StitchCanvas.jsx';
import {addFlushHandler} from '../lifecycle.js';

export const StitchWorkspace=forwardRef(function StitchWorkspace({active,inspectorOpen,setInspectorOpen,onBusy,onCount},ref){
 const {projects,project,update,open,create,remove,loading,saving,saveError,flush,retry}=useProjects();
 const [selected,setSelected]=useState(null),[checked,setChecked]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[importing,setImporting]=useState(false),[batch,setBatch]=useState(null),[output,setOutput]=useState(null),[processing,setProcessing]=useState(false),[view,setView]=useState('layout'),[folder,setFolder]=useState(null);
 const unit=project?.export.unit||'MB',setUnit=unit=>setExport({unit});
 useEffect(()=>setSelected(project?.images[0]?.id||null),[project?.id]);
 const input=useRef(),dragId=useRef(),cancel=useRef(false),exportTask=useRef(Promise.resolve()),importTask=useRef(Promise.resolve());
 const calculation=useMemo(()=>{try{return {layout:calculateLayout(project||{})};}catch(e){try{return {layout:calculateLayout(project||{},{draft:true}),error:e.message};}catch{return {error:e.message};}}},[project]);
 const {layout}=calculation;
 const busy=loading||importing||!!batch;
 useEffect(()=>{onBusy(busy||saving||processing||!!saveError);onCount(project?.images.length||0);},[busy,saving,processing,saveError,project?.images.length]);
 useEffect(()=>addFlushHandler(async()=>{await importTask.current;await exportTask.current;await flush();}),[]);
 useEffect(()=>{
  let live=true;setOutput(null);setError('');
  if(!active||!layout||calculation.error||busy){setProcessing(false);return;}
  setProcessing(true);const timer=setTimeout(()=>api.stitchRender(project,{latest:true}).then(result=>{if(live)setOutput(result);}).catch(e=>{if(live&&!e.message.includes('预览参数已更新'))setError(e.message);}).finally(()=>{if(live)setProcessing(false);}),500);
  return()=>{live=false;clearTimeout(timer);};
 },[active,project,busy]);
 async function accept(items){
  if(items.length){update(p=>{if(p.images.length+items.length>100||p.images.reduce((s,i)=>s+i.bytes,0)+items.reduce((s,i)=>s+i.bytes,0)>500*1024*1024)throw new Error('每个项目最多 100 张、500 MB');return p.layout==='free'?appendFreeImages(p,items):{...p,images:[...p.images,...items]};});setSelected(items[0].id);}
 }
 async function runImportFiles(files){
  if(busy||!project)return;const list=Array.from(files);if(!list.length)return;setImporting(true);setNotice('');
  try{for(const file of list){const item=await repository.import(file);await accept([item]);}}
  catch(e){setNotice(e.message);}finally{setImporting(false);if(input.current)input.current.value='';}
 }
 function importFiles(files){const task=runImportFiles(files);importTask.current=task;return task;}
 async function runAdd(){
  if(busy||!project)return;if(!desktop){input.current.click();return;}
  setImporting(true);try{const result=await api.stitchChooseFiles();await accept(result.items);if(result.errors.length)setNotice(result.errors.join('；'));}catch(e){setNotice(e.message);}finally{setImporting(false);}
 }
 function add(){const task=runAdd();importTask.current=task;return task;}
 async function chooseFolder(){const value=await api.chooseFolder();if(value)setFolder(value);return value;}
 async function runExport(ids){
  if(busy||!ids.length)return;await flush();if(!folder&&!await chooseFolder())return;
  cancel.current=false;setBatch({current:0,total:ids.length});setNotice('');let success=0;const failures=[];
  try{
   for(let n=0;n<ids.length;n++){
    if(cancel.current)break;setBatch({current:n+1,total:ids.length});
    try{const snapshot=ids[n]===project.id?structuredClone(project):await repository.load(ids[n]);await repository.prepare(snapshot,{previews:false});const result=await api.stitchRender(snapshot);await api.save(result.token);success++;}
    catch(e){failures.push(`${projects.find(p=>p.id===ids[n])?.name||'拼图'}：${e.message}`);}
   }
   setNotice(`已导出 ${success} 个项目${failures.length?'；'+failures.join('；'):cancel.current?'，已取消':''}`);
  }finally{setBatch(null);}
 }
 function exportProjects(ids){const task=runExport(ids).catch(e=>setNotice(e.message));exportTask.current=task;return task;}
 useImperativeHandle(ref,()=>({add,importFiles,export:()=>exportProjects(project?[project.id]:[])}));
 function setLayout(type){
  if(type===project.layout)return;
  if(type==='free'){
   if(!project.images.length){update({layout:type,positions:{}});return;}
   if(!layout){setNotice('请先调整为有效布局');return;}
   update(initializeFree(project,layout,'centres'));
  }else update({layout:type});
 }
 const setExport=changes=>update(p=>({...p,export:{...p.export,...changes}}));
 const removeImage=id=>{update(p=>({...p,images:p.images.filter(i=>i.id!==id)}));if(selected===id)setSelected(null);};
 const changeOrder=(from,to)=>update(p=>({...p,images:moveImage(p.images,from,to)}));
 return <>
  <input ref={input} type="file" className="sr-only" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择拼接图片文件" onChange={e=>importFiles(e.target.files)}/>
  <section className="stage stitch-stage" aria-label="拼接工作台">
   <div className="project-bar">
    <div className="project-tabs" aria-label="拼图项目">{projects.map(p=><div key={p.id} className={`project-tab ${p.id===project?.id?'active':''}`}>
     <input type="checkbox" aria-label={`批量选择 ${p.name}`} checked={checked.includes(p.id)} disabled={busy} onChange={e=>setChecked(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>
     <button disabled={busy} onClick={()=>open(p.id).catch(e=>setNotice(e.message))}>{p.name}<span>{p.count}</span></button>
    </div>)}</div>
    <TooltipButton label="新建拼图项目" className="icon-button" disabled={busy} onClick={()=>create().catch(e=>setNotice(e.message))}><Plus size={21} weight="bold"/></TooltipButton>
    <TooltipButton label="删除当前项目" className="icon-button" disabled={busy||!project} onClick={()=>remove(project.id).then(()=>setChecked(old=>old.filter(id=>id!==project.id))).catch(e=>setNotice(e.message))}><Trash size={20}/></TooltipButton>
   </div>
   <div className="preview-workspace">
    <div className="file-toolbar">
     <input className="project-name" aria-label="项目名称" maxLength="80" value={project?.name||''} disabled={busy||!project} onChange={e=>update({name:e.target.value})}/>
     <div className="preview-actions">
      <span className={`save-status ${saveError?'error':''}`} role="status">{saveError?'未保存':saving?'保存中…':'已自动保存'}</span>
      {project?.images.length>0&&<div className="view-switch"><button className={view==='layout'?'active':''} onClick={()=>setView('layout')}>布局</button><button className={view==='processed'?'active':''} onClick={()=>setView('processed')}>处理后</button></div>}
      {!inspectorOpen&&<TooltipButton label="展开导出设置" placement="left" className="icon-button panel-toggle" onClick={()=>setInspectorOpen(true)}><SidebarSimple size={23}/></TooltipButton>}
     </div>
    </div>
    {project?.images.length?<>
     {view==='layout'?<StitchCanvas project={project} layout={layout} selected={selected} onSelect={setSelected} onChange={positions=>update({positions})} disabled={busy}/>:<div className="stitch-canvas-area">{output?<img className="stitch-output checkerboard" src={output.preview} alt="真实导出预览"/>:<span>{processing?'计算中…':error||calculation.error}</span>}</div>}
     <div className="stitch-info" aria-live="polite"><span>{layout?`${layout.width} × ${layout.height}`:calculation.error}</span><span title={output?.difference?`RGB 最大误差 ${output.difference.maxError}/255，RMSE ${output.difference.rmse.toFixed(4)}；透明度误差 ${output.difference.alphaMaxError}`:undefined}>{processing?'计算中…':output?`${output.encoding||output.format.toUpperCase()} · ${output.bytes.toLocaleString()} 字节`:error}</span>{layout?.rects.some(r=>r.crop)&&<span>9:16 居中裁切</span>}</div>
    </>:<div className="canvas-area"><div className="empty-state"><img className="empty-illustration" src="./assets/blue-file-empty.png" alt=""/><button className="primary import-button" disabled={busy||!project} onClick={add}><Plus size={28} weight="bold"/>{loading?'恢复中…':'添加图片'}</button></div></div>}
   </div>
   <div className="queue-region">
    <div className="queue-toolbar"><span>图片<span className="queue-count">{project?.images.length||0}</span></span><button className="icon-button queue-clear" aria-label="清空拼接图片" disabled={busy||!project?.images.length} onClick={()=>update({images:[],positions:{}})}><Trash size={21}/></button></div>
    <div className="filmstrip" aria-label="拼接图片队列">{project?.images.map((image,n)=><div key={image.id} className={`film-item ${selected===image.id?'selected':''}`} draggable={!busy} onDragStart={e=>{dragId.current=image.id;e.dataTransfer.setData('text/qingtu-image',image.id);e.dataTransfer.effectAllowed='move';}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragId.current)changeOrder(dragId.current,image.id);dragId.current=null;}}>
     <button className="film-select" aria-label={`选中 ${image.name}`} disabled={busy} onClick={()=>{setSelected(image.id);setView('layout');}}><img src={image.preview} alt={image.name}/></button>
     <button className="film-remove" aria-label={`移除 ${image.name}`} disabled={busy} onClick={()=>removeImage(image.id)}><X size={14}/></button>
     <span className="filename">{image.name}</span><div className="order-actions"><button aria-label={`前移 ${image.name}`} disabled={busy||n===0} onClick={()=>changeOrder(image.id,project.images[n-1].id)}><ArrowLeft size={13}/></button><button aria-label={`后移 ${image.name}`} disabled={busy||n===project.images.length-1} onClick={()=>changeOrder(image.id,project.images[n+1].id)}><ArrowRight size={13}/></button></div>
    </div>)}<div className="film-item add-item"><button className="add-tile" aria-label="添加拼接图片" disabled={busy||!project} onClick={add}><Plus size={38} weight="bold"/></button><span className="filename">添加图片</span></div></div>
   </div>
  </section>
  <div className="inspector-shell"><aside className="inspector" aria-label="拼接导出设置" aria-hidden={!inspectorOpen} inert={!inspectorOpen}>
   <div className="inspector-heading"><h1>拼接</h1><TooltipButton label="收起导出设置" placement="left" className="icon-button panel-toggle" onClick={()=>setInspectorOpen(false)}><SidebarSimple size={23}/></TooltipButton></div>
   <div className="settings-scroll">
     <div className="control-section"><h2>布局</h2><div className="layout-options">{[['horizontal','横排'],['vertical','竖排'],['grid','宫格'],['free','自由']].map(([type,label])=><button key={type} disabled={busy||!project} className={project?.layout===type?'active':''} aria-pressed={project?.layout===type} onClick={()=>setLayout(type)}>{label}</button>)}</div></div>
    {project?.layout==='grid'&&<div className="control-section"><h2>行列</h2><div className="dimension-inputs stitch-pair"><div className="number-with-unit"><input aria-label="宫格行数" type="number" min="1" max="100" disabled={busy} value={project.grid.rows} onChange={e=>update({grid:{...project.grid,rows:Number(e.target.value)}})}/><span>行</span></div><div className="number-with-unit"><input aria-label="每行最多列数" type="number" min="1" max="100" disabled={busy} value={project.grid.columns} onChange={e=>update({grid:{...project.grid,columns:Number(e.target.value)}})}/><span>列</span></div></div></div>}
    {project?.layout==='free'&&selected&&<div className="control-section"><label htmlFor="image-width">图片宽度</label><div className="number-with-unit"><input id="image-width" type="number" min="1" value={Math.round(project.positions[selected]?.width||0)} onChange={e=>update({positions:{...project.positions,[selected]:{...project.positions[selected],width:Number(e.target.value)}}})}/><span>px</span></div></div>}
    {project?.layout==='free'&&selected&&<div className="control-section"><h2>位置</h2><div className="dimension-inputs stitch-pair">{['x','y'].map(axis=><div className="number-with-unit" key={axis}><input aria-label={`图片位置 ${axis.toUpperCase()}`} type="number" disabled={busy} value={Math.round(project.positions[selected]?.[axis]||0)} onChange={e=>update({positions:{...project.positions,[selected]:{...project.positions[selected],[axis]:Number(e.target.value)}}})}/><span>{axis.toUpperCase()}</span></div>)}</div></div>}
    <div className="control-section"><label htmlFor="stitch-long-edge">长边</label><div className="number-with-unit"><input id="stitch-long-edge" type="number" min="1" max="5999" disabled={busy||!project} value={project?.export.longEdge||''} onChange={e=>setExport({longEdge:Number(e.target.value)})}/><span>px</span></div></div>
    <div className="control-section"><label htmlFor="stitch-target">大小上限</label><div className="target-control"><input id="stitch-target" type="number" min="1" max={unit==='MB'?100:100000} step="1" disabled={busy||!project} value={project?(project.export.targetBytes/(unit==='MB'?1000000:1000)):10} onChange={e=>setExport({targetBytes:Number(e.target.value)*(unit==='MB'?1000000:1000)})}/><Dropdown label="拼接大小单位" className="unit-dropdown" value={unit} onChange={setUnit} disabled={busy||!inspectorOpen} options={[{value:'MB',label:'MB'},{value:'KB',label:'KB'}]}/></div></div>
    <div className="control-section"><label htmlFor="stitch-format">格式</label><Dropdown id="stitch-format" label="拼接输出格式" value={project?.export.format||'png'} onChange={format=>setExport({format})} disabled={busy||!project||!inspectorOpen} options={[{value:'auto',label:'自动'},{value:'jpeg',label:'JPG'},{value:'png',label:'PNG'}]}/></div>
   </div>
   <div className="export-section">
    {(saveError||calculation.error&&project?.images.length>0||error)&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{saveError||calculation.error||error}</span>{saveError&&<button onClick={retry}>重试</button>}</div>}
    <label>输出文件夹</label><button className="folder-control" disabled={busy} onClick={()=>chooseFolder().catch(e=>setNotice(e.message))}><FolderSimple size={23}/><span>{folder?.name||'选择文件夹'}</span></button>
    <button className="primary export-button" disabled={busy||!layout||!!calculation.error||!!saveError||!!error} onClick={()=>exportProjects([project.id])}>{batch?<><SpinnerGap className="spin" size={23}/>导出 {batch.current} / {batch.total}</>:'导出当前拼图'}</button>
    <button className="batch-project-export" disabled={busy||!checked.length||!!saveError} onClick={()=>exportProjects(checked)}>批量导出 {checked.length} 个项目</button>
    {batch&&<button className="cancel-button" onClick={()=>{cancel.current=true;}}>取消后续</button>}
   </div>
  </aside></div>
  {notice&&active&&<div className="notice" role="status"><CheckCircle size={23}/><span>{notice}</span><button className="icon-button" aria-label="关闭拼接提示" onClick={()=>setNotice('')}><X size={18}/></button></div>}
 </>;
});
