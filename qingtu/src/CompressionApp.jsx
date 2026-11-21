import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus,LinkSimple,LinkSimpleBreak,X,Minus,Square,ArrowCounterClockwise,ImageSquare,SpinnerGap,CheckCircle,WarningCircle,Trash,SidebarSimple} from '@phosphor-icons/react';
import {api,desktop,readFile} from './api.js';
import {OutputFolder,useOutputFolder} from './OutputFolder.jsx';
import {Dropdown} from './Dropdown.jsx';
import {ImagePreview} from './ImagePreview.jsx';
import {ToolNavigation} from './ToolNavigation.jsx';
import {TooltipButton} from './TooltipButton.jsx';
import {AppUpdates} from './AppUpdates.jsx';
import {StitchWorkspace} from './stitch/StitchWorkspace.jsx';
import {CompressionQueue} from './CompressionQueue.jsx';
import {CompressionName} from './CompressionName.jsx';
import {addFlushHandler,flushWork} from './lifecycle.js';
import {outputFormats,explicitFormat,formatFileSize,sizeChangeLabel} from './export-format.js';
import {blockPreviewDrag,isExternalFileTransfer} from './file-drop.js';

const defaults={type:'scale',percent:100,locked:true,anchor:'width',width:3840,height:2160};
const isMac=desktop&&window.qingtu.platform==='darwin';
function validateSettings(target,{targetBytes,resize}){
 if(!Number.isInteger(Number(target))||Number(target)<1||targetBytes>100000000)return '请输入 1–100 MB 或 1–100000 KB 的整数';
 if(resize.type==='scale')return Number(resize.percent)>=0.1&&Number(resize.percent)<=400?'':'缩放比例须为 0.1–400%';
 const sides=resize.locked?[resize[resize.anchor]]:[resize.width,resize.height];
 const valid=sides.every(side=>Number.isInteger(Number(side))&&Number(side)>=1&&Number(side)<=16384);
 return valid?'':'尺寸须为 1–16384 像素';
}
export function CompressionApp(){
 const [module,setModule]=useState('stitch'),[stitchBusy,setStitchBusy]=useState(false),[stitchCount,setStitchCount]=useState(0);
 const stitch=useRef(),queue=useRef(),nameEditor=useRef(),exportTask=useRef(Promise.resolve()),deleteTask=useRef(Promise.resolve()),deleteLock=useRef(false),exportLock=useRef(false);
 const [items,setItems]=useState([]),[selectedId,setSelectedId]=useState(null),[loading,setLoading]=useState(false),[deleting,setDeleting]=useState(false),[exportSelection,setExportSelection]=useState(null);
 const [target,setTarget]=useState(10),[unit,setUnit]=useState('MB'),[format,setFormat]=useState('png'),[resize,setResize]=useState(defaults);
 const [preview,setPreview]=useState(null),[processing,setProcessing]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(null);
 const folder=useOutputFolder('compression',text=>setNotice({type:'error',text}));
 const [view,setView]=useState('compare'),[previewReset,setPreviewReset]=useState(0),[batch,setBatch]=useState(null),[statuses,setStatuses]=useState({}),[dragging,setDragging]=useState(false);
 const [inspectorOpen,setInspectorOpenState]=useState(()=>!window.matchMedia('(max-width:760px)').matches),[inspectorRevision,setInspectorRevision]=useState(0);
 const inspectorManual=useRef(false);
 const setInspectorOpen=value=>{inspectorManual.current=true;setInspectorOpenState(value);setInspectorRevision(revision=>revision+1);};
 useEffect(()=>{
  const narrow=window.matchMedia('(max-width:760px)'),sync=()=>{if(!inspectorManual.current)setInspectorOpenState(!narrow.matches);};
  sync();narrow.addEventListener('change',sync);return()=>narrow.removeEventListener('change',sync);
 },[]);
 useEffect(()=>window.qingtu?.onFlush(flushWork),[]);
 useEffect(()=>addFlushHandler(()=>Promise.all([exportTask.current,deleteTask.current])),[]);
 const fileInput=useRef(),cancel=useRef(false),actions=useRef({}),depth=useRef(0);
 const selected=items.find(i=>i.id===selectedId)||items[0];
 const exportItems=items.filter(file=>exportSelection===null||exportSelection.includes(file.id)),exportIds=exportItems.map(file=>file.id);
 function selectExport(id,checked){setExportSelection(previous=>{const ids=items.filter(file=>previous===null||previous.includes(file.id)).map(file=>file.id);return checked?[...new Set([...ids,id])]:ids.filter(value=>value!==id);});}
 async function rename(id,name){const value=await api.rename(id,name);setItems(old=>old.map(file=>file.id===id?{...file,name:value.name}:file));}
 async function openImage(id){try{await nameEditor.current?.flush();setSelectedId(id);return true;}catch(e){setNotice({type:'error',text:e.message});return false;}}
 const size=useMemo(()=>{
  if(!selected)return {width:resize.width,height:resize.height};
  if(resize.type==='scale')return {width:Math.round(selected.width*Number(resize.percent)/100),height:Math.round(selected.height*Number(resize.percent)/100)};
  if(resize.locked)return resize.anchor==='height'?{width:Math.round(Number(resize.height)*selected.width/selected.height),height:resize.height}:{width:resize.width,height:Math.round(Number(resize.width)*selected.height/selected.width)};
  return {width:resize.width,height:resize.height};
 },[selected?.id,resize]);
 const settings=useMemo(()=>({mode:'smart',targetBytes:Math.floor(Number(target)*(unit==='MB'?1000000:1000)),format:explicitFormat(format),resize}),[target,unit,format,resize]);
 const settingsError=validateSettings(target,settings);
 const key=JSON.stringify(settings);
 const output=preview && preview.fileId===selected?.id && preview.key===key && !batch ? preview.result : null;
 const scale=resize.type==='scale'?resize.percent:selected?Math.round(Number(size.width)/selected.width*1000)/10:100;
 useEffect(()=>{
  let live=true;setPreview(null);setError('');
  if(settingsError){setError(settingsError);setProcessing(false);return;}
  if(!selected||batch){setProcessing(false);return;}
  setProcessing(true);
  const timer=setTimeout(()=>api.process(selected.id,settings,{latest:true}).then(result=>{
   if(live)setPreview({fileId:selected.id,key,result});
  }).catch(e=>live&&setError(e.message)).finally(()=>live&&setProcessing(false)),300);
  return()=>{live=false;clearTimeout(timer);};
 },[selected?.id,key,!!batch]);
 useEffect(()=>{if(notice?.type==='success'){const t=setTimeout(()=>setNotice(null),7000);return()=>clearTimeout(t);}},[notice]);
 useEffect(()=>{
  const handler=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='o'){e.preventDefault();actions.current.add?.();}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();actions.current.export?.();}};
  window.addEventListener('keydown',handler);const cleanup=window.qingtu?.onMenu(action=>{if(document.querySelector('dialog[open]'))return;return action==='import'?actions.current.add?.():actions.current.export?.();});
  return()=>{window.removeEventListener('keydown',handler);cleanup?.();};
 },[]);
 async function accept(result){
  if(result.items.length){await Promise.all(items.filter(i=>i.sample).map(i=>api.remove(i.id)));setItems(old=>[...old.filter(i=>!i.sample),...result.items]);setSelectedId(result.items[0].id);if(!items.some(i=>!i.sample))setResize(defaults);setExportSelection(old=>old===null?null:[...old.filter(id=>items.some(i=>i.id===id&&!i.sample)),...result.items.map(i=>i.id)]);}
  if(result.errors.length)setNotice({type:'error',text:result.errors.join('；')});
 }
 async function importFiles(files){
  if(batch||loading||deleting)return;const list=Array.from(files);if(!list.length)return;setLoading(true);setNotice(null);
  try{await nameEditor.current?.flush();const result={items:[],errors:[]};for(const f of list){try{if(f.size>100*1048576)throw new Error('单张图片须小于 100 MB');const r=await api.importFiles([await readFile(f)]);result.items.push(...r.items);result.errors.push(...r.errors);}catch(e){result.errors.push(f.name+'：'+e.message);}}await accept(result);}
  catch(e){setNotice({type:'error',text:e.message});}finally{setLoading(false);if(fileInput.current)fileInput.current.value='';}
 }
 async function add(){if(batch||loading||deleting)return;if(!desktop){fileInput.current.click();return;}setLoading(true);try{await nameEditor.current?.flush();await accept(await api.chooseFiles());}catch(e){setNotice({type:'error',text:e.message});}finally{setLoading(false);}}
 async function removeFiles(ids){
  if(batch||loading||deleteLock.current||exportLock.current)return;
  deleteLock.current=true;setDeleting(true);
  try{
   await nameEditor.current?.flush();await queue.current?.flush();const removed=[],errors=[];
   for(const id of [...new Set(ids)]){try{await api.remove(id);removed.push(id);}catch(e){errors.push(e.message);}}
   setItems(old=>old.filter(file=>!removed.includes(file.id)));setSelectedId(current=>removed.includes(current)?null:current);
   const remaining=items.filter(file=>!removed.includes(file.id));setExportSelection(previous=>!remaining.length?null:previous===null?null:previous.filter(id=>!removed.includes(id)));
   setStatuses(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!removed.includes(id))));
   if(errors.length)setNotice({type:'error',text:errors.join('；')});
  }catch(e){setNotice({type:'error',text:e.message});}finally{deleteLock.current=false;setDeleting(false);}
 }
 function remove(ids){if(deleteLock.current)return deleteTask.current;const task=removeFiles(ids);deleteTask.current=task;return task;}
 async function runExport(ids){
  const files=ids?items.filter(file=>ids.includes(file.id)):[...exportItems];
  if(!files.length||batch||loading||deleting||settingsError||exportLock.current)return;
  const config=structuredClone(settings);exportLock.current=true;cancel.current=false;setBatch({current:0,total:files.length});setNotice(null);setStatuses({});let success=0,failed=0,adjusted=0;
  try{
   const destination=await folder.prepare();if(!destination)return;
   await nameEditor.current?.flush();await queue.current?.flush();
   for(let i=0;i<files.length;i++){
    if(cancel.current)break;const file=files[i];setBatch({current:i+1,total:files.length});setStatuses(old=>({...old,[file.id]:{type:'busy'}}));
    try{const r=await api.process(file.id,config);await folder.save(r.token,destination);success++;if(r.autoResized)adjusted++;setStatuses(old=>({...old,[file.id]:{type:'success',text:`${formatFileSize(r.bytes)}${r.autoResized?` · ${r.width} × ${r.height}`:''}`}}));}
    catch(e){failed++;setStatuses(old=>({...old,[file.id]:{type:'error',text:e.message}}));}
   }
   setNotice({type:failed?'error':'success',text:`${cancel.current?'已取消，导出':'已导出'} ${success} 张${failed?`，${failed} 张未完成`:''}${adjusted?`，${adjusted} 张已等比调整尺寸`:''}`,reveal:success>0&&desktop});
  }catch(e){setNotice({type:'error',text:e.message});}finally{exportLock.current=false;setBatch(null);}
 }
 function exportImages(ids){if(exportLock.current)return exportTask.current;const task=runExport(ids);exportTask.current=task;return task;}
 function exportAll(){return exportImages();}
 actions.current=module==='compress'?{add,export:exportAll}:{add:()=>stitch.current?.add(),export:()=>stitch.current?.export()};
 function editDimension(field,value){setResize(old=>({...old,type:'pixels',width:size.width,height:size.height,[field]:value,anchor:field}));}

 function reset(){setTarget(10);setUnit('MB');setFormat('png');setResize(defaults);setPreviewReset(v=>v+1);setError('');}
 const windowButtons=<div className="window-controls"><button aria-label="最小化" onClick={()=>api.windowAction('minimize')}><Minus size={16}/></button><button aria-label="最大化或还原" onClick={()=>api.windowAction('maximize')}><Square size={13}/></button><button className="window-close" aria-label="关闭窗口" onClick={()=>api.windowAction('close')}><X size={17}/></button></div>;
 return <div data-module={module} className={`app ${inspectorOpen?'':'inspector-collapsed'}`} onDragStartCapture={e=>{if(e.target.tagName==='IMG'||e.target.closest('.canvas-card'))blockPreviewDrag(e);}} onDragOver={e=>e.preventDefault()} onDragEnter={e=>{if(isExternalFileTransfer(e.dataTransfer)){depth.current++;setDragging(true);}}} onDragLeave={()=>{if(--depth.current<=0){setDragging(false);depth.current=0;}}} onDrop={e=>{e.preventDefault();depth.current=0;setDragging(false);if(!isExternalFileTransfer(e.dataTransfer)||!e.dataTransfer.files.length)return;if(module==='compress')importFiles(e.dataTransfer.files);else stitch.current?.importFiles(e.dataTransfer.files);}}>
  <header className={`titlebar ${isMac?'mac-titlebar':''}`}>
   <div className="brand"><img src="./assets/app-icon.png" alt="" draggable={false}/><strong>轻图</strong></div><AppUpdates busy={processing||loading||deleting||!!batch||stitchBusy} hasImages={items.length>0}/>{desktop&&!isMac&&windowButtons}
  </header>
  <input ref={fileInput} className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择图片文件" onChange={e=>importFiles(e.target.files)}/>
  <main className="workspace">
   <ToolNavigation selected={module} onSelect={setModule}/>
   <div className="module-content" hidden={module!=='compress'}>
   <section className="stage" aria-label="图片预览">
    <div className={`preview-workspace ${selected?'has-image':''} ${dragging?'dragging':''}`}>
     <div className="file-toolbar">
      <div className="compression-name-slot">{selected?<CompressionName key={selected.id} ref={nameEditor} file={selected} onRename={rename} active={module==='compress'} disabled={loading||deleting||!!batch}/>:<span className="file-toolbar-name">未选择图片</span>}</div>
      <div className="preview-actions">
       <div className="view-switch" role="group" aria-label="预览方式">
        {[{value:'original',label:'原图',aria:'查看原图'},{value:'compare',label:'对比',aria:'对比原图与结果'},{value:'processed',label:'处理后',aria:'查看处理后图片'}].map(option=><button key={option.value} className={view===option.value?'active':''} disabled={!selected} aria-label={option.aria} aria-pressed={view===option.value} onClick={()=>setView(option.value)}>{option.label}</button>)}
       </div>
       {!inspectorOpen&&<TooltipButton label="展开导出设置" placement="left" className="icon-button panel-toggle" aria-expanded={false} aria-controls="export-inspector" onClick={()=>setInspectorOpen(true)}><SidebarSimple size={24} weight="bold" aria-hidden/></TooltipButton>}
      </div>
     </div>
     <div className="canvas-area">
      {selected?<div className="canvas-content">
       <ImagePreview key={`${selected.id}:${previewReset}`} selected={selected} output={output} processing={processing} view={view} error={error}/>
       <div className="preview-info" aria-live="polite">
        <span className="size-comparison" title={output?`原图 ${selected.bytes.toLocaleString()} 字节 → 处理后 ${output.bytes.toLocaleString()} 字节`:undefined}>
         <span className="size-pair">{formatFileSize(selected.bytes)}<span className="info-arrow"> → </span>{output?formatFileSize(output.bytes):processing?'计算中…':'—'}</span>
         {output&&<> · <strong className={output.bytes>selected.bytes?'size-increase':undefined}>{sizeChangeLabel(selected.bytes,output.bytes)}</strong></>}
        </span>
        <span title={output?.autoResized?`为满足体积上限，已从设置的 ${output.requestedWidth} × ${output.requestedHeight} 等比调整` :undefined}>{selected.width} × {selected.height}{output&&(output.width!==selected.width||output.height!==selected.height)&&<> → {output.width} × {output.height}</>}{output?.autoResized&&' · 等比调整'}</span>
        <span className="preview-status" title={output?`${output.encoding||(output.lossless?'无损编码':`编码质量 ${output.quality}`)} · ${output.bytes.toLocaleString()} 字节${output.autoResized?'；像素误差以实际尺寸的等比缩放图为基准':''}`:undefined}>{output?(output.format==='jpeg'?'JPG':output.format.toUpperCase()):loading?'正在导入…':error?'预览失败':processing?'正在处理…':'就绪'}</span>
       </div>
      </div>:<div className="empty-state">
       <img className="empty-illustration" src="./assets/blue-file-empty.png" alt="" draggable={false}/>
       <button className="primary import-button" disabled={loading} onClick={add}>{loading?<SpinnerGap size={25} className="spin"/>:<Plus size={30} weight="bold"/>}{loading?'正在准备…':'添加图片'}</button>
      </div>}
     </div>
    </div>
    <CompressionQueue ref={queue} items={items} currentId={selected?.id} selectedIds={exportIds} selectionExplicit={exportSelection!==null} onOpen={openImage} onAdd={add} onSelect={selectExport} onSelectAll={checked=>setExportSelection(checked?null:[])} onExport={id=>exportImages([id])} onRename={rename} onDelete={remove} statuses={statuses} disabled={loading||deleting||!!batch} active={module==='compress'}/>
   </section>
   <div className="inspector-shell">
    <aside className="inspector" id="export-inspector" aria-label="导出设置" aria-hidden={!inspectorOpen} inert={!inspectorOpen}>
     <div className="inspector-heading">
      <h1>导出</h1>
      <div className="inspector-actions">
       <TooltipButton label="重置设置" placement="left" className="icon-button" onClick={reset} disabled={!!batch}><ArrowCounterClockwise size={23} weight="bold" aria-hidden/></TooltipButton>
       <TooltipButton label="收起导出设置" placement="left" className="icon-button panel-toggle" aria-expanded={true} aria-controls="export-inspector" onClick={()=>setInspectorOpen(false)}><SidebarSimple size={23} weight="bold" aria-hidden/></TooltipButton>
      </div>
     </div>
     <div className="settings-scroll">
      <div className="control-section">
       <label htmlFor="target-size">大小上限</label>
       <div className="target-control">
        <input id="target-size" title="输出不超过此大小。1 MB = 1,000,000 字节。" type="number" inputMode="numeric" min="1" max={unit==='MB'?100:100000} step="1" value={target} onChange={e=>{const value=e.target.value;if(value===''||Number.isInteger(Number(value)))setTarget(value);}} onBlur={()=>{if(target==='')setTarget(10);}} disabled={!!batch}/>
        <Dropdown id="unit" label="文件大小单位" className="unit-dropdown" value={unit} onChange={setUnit} disabled={!!batch||!inspectorOpen} options={[{value:'MB',label:'MB'},{value:'KB',label:'KB'}]}/>
       </div>
      </div>
      <div className="control-section">
       <h2>尺寸</h2>
       <div className="dimension-inputs">
        <div className="number-with-unit"><input id="width" aria-label="宽度" type="number" min="1" max="16384" value={size.width||''} disabled={!!batch} onChange={e=>editDimension('width',e.target.value)}/><span>px</span></div>
        <button className="link-button" disabled={!!batch} aria-label={resize.locked?'解锁宽高比例':'锁定宽高比例'} aria-pressed={resize.locked} title="保持比例" onClick={()=>setResize(old=>({...old,locked:!old.locked,width:size.width,height:size.height}))}>{resize.locked?<LinkSimple size={25} weight="bold"/>:<LinkSimpleBreak size={25} weight="bold"/>}</button>
        <div className="number-with-unit"><input id="height" aria-label="高度" type="number" min="1" max="16384" value={size.height||''} disabled={!!batch} onChange={e=>editDimension('height',e.target.value)}/><span>px</span></div>
       </div>
      </div>
      <div className="control-section"><label htmlFor="scale">缩放</label><div className="number-with-unit"><input id="scale" type="number" min="0.1" max="400" step="0.1" value={scale||''} disabled={!!batch} onChange={e=>setResize(old=>({...old,type:'scale',percent:e.target.value}))}/><span>%</span></div></div>
      <div className="control-section format-section"><label htmlFor="format">格式</label><Dropdown id="format" label="输出格式" value={explicitFormat(format)} onChange={setFormat} disabled={!!batch||!inspectorOpen} options={outputFormats}/></div>
     </div>
     <div className="export-section">
      {error&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{error}</span></div>}
      <OutputFolder folder={folder} disabled={!!batch}/>
      <button className="primary export-button" disabled={!exportItems.length||loading||deleting||!!batch||!!settingsError} onClick={exportAll}>{batch?<><SpinnerGap size={22} className="spin"/>导出 {batch.current} / {batch.total}</>:<>导出 {exportItems.length} 张图片</>}</button>
      <div className="export-secondary">{batch&&<button className="cancel-button" onClick={()=>{cancel.current=true;}}>取消后续</button>}</div>
     </div>
    </aside>
   </div>
   </div>
   <div className="module-content" hidden={module!=='stitch'}><StitchWorkspace ref={stitch} active={module==='stitch'} inspectorRevision={inspectorRevision} inspectorOpen={inspectorOpen} setInspectorOpen={setInspectorOpen} onBusy={setStitchBusy} onCount={setStitchCount}/></div>
  </main>
  {notice&&module==='compress'&&<div className={`notice ${notice.type}`} role={notice.type==='error'?'alert':'status'}>{notice.type==='error'?<WarningCircle size={23} weight="bold"/>:<CheckCircle size={23} weight="fill" className="success-icon"/>}<span>{notice.text}</span>{notice.reveal&&<button onClick={folder.reveal}>打开文件夹</button>}<button className="icon-button" aria-label="关闭提示" onClick={()=>setNotice(null)}><X size={18}/></button></div>}
  {dragging&&<div className="drop-overlay"><Plus size={40} weight="bold"/><span>松开以添加图片</span></div>}
 </div>;
}
