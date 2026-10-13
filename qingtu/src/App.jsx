import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus,FolderSimple,LinkSimple,LinkSimpleBreak,X,Minus,Square,ArrowCounterClockwise,ImageSquare,SpinnerGap,CheckCircle,WarningCircle,Trash,SidebarSimple} from '@phosphor-icons/react';
import {api,desktop,readFile} from './api.js';
import {Dropdown} from './Dropdown.jsx';
import {ImagePreview} from './ImagePreview.jsx';
import {ToolNavigation} from './ToolNavigation.jsx';
import {TooltipButton} from './TooltipButton.jsx';
import {AppUpdates} from './AppUpdates.jsx';

const bytesText=b=>b<1000?`${b} B`:b<1000000?`${Math.ceil(b/1000)} KB`:`${Math.ceil(b/1000000)} MB`;
const defaults={type:'scale',percent:100,locked:true,anchor:'width',width:3840,height:2160};
const isMac=desktop&&window.qingtu.platform==='darwin';
export function App(){
 const [items,setItems]=useState([]),[selectedId,setSelectedId]=useState(null),[loading,setLoading]=useState(false);
 const [target,setTarget]=useState(10),[unit,setUnit]=useState('MB'),[format,setFormat]=useState('png'),[resize,setResize]=useState(defaults);
 const [output,setOutput]=useState(null),[processing,setProcessing]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(null);
 const [view,setView]=useState('compare'),[previewReset,setPreviewReset]=useState(0),[folder,setFolder]=useState(null),[batch,setBatch]=useState(null),[statuses,setStatuses]=useState({}),[dragging,setDragging]=useState(false);
 const [inspectorOpen,setInspectorOpen]=useState(true);
 const fileInput=useRef(),cancel=useRef(false),actions=useRef({}),depth=useRef(0);
 const selected=items.find(i=>i.id===selectedId)||items[0];
 const size=useMemo(()=>{
  if(!selected)return {width:resize.width,height:resize.height};
  if(resize.type==='scale')return {width:Math.round(selected.width*Number(resize.percent)/100),height:Math.round(selected.height*Number(resize.percent)/100)};
  if(resize.locked)return resize.anchor==='height'?{width:Math.round(Number(resize.height)*selected.width/selected.height),height:resize.height}:{width:resize.width,height:Math.round(Number(resize.width)*selected.height/selected.width)};
  return {width:resize.width,height:resize.height};
 },[selected?.id,resize]);
 const settings=useMemo(()=>({mode:'smart',targetBytes:Math.floor(Number(target)*(unit==='MB'?1000000:1000)),format,resize}),[target,unit,format,resize]);
 const key=JSON.stringify(settings);
 const scale=resize.type==='scale'?resize.percent:selected?Math.round(Number(size.width)/selected.width*1000)/10:100;
 useEffect(()=>{
  let live=true;setOutput(null);setError('');
  if(!selected||batch){setProcessing(false);return;}
  setProcessing(true);
  const timer=setTimeout(()=>api.process(selected.id,settings,{latest:true}).then(r=>live&&setOutput(r)).catch(e=>live&&setError(e.message)).finally(()=>live&&setProcessing(false)),300);
  return()=>{live=false;clearTimeout(timer);};
 },[selected?.id,key,!!batch]);
 useEffect(()=>{if(notice?.type==='success'){const t=setTimeout(()=>setNotice(null),7000);return()=>clearTimeout(t);}},[notice]);
 useEffect(()=>{
  const handler=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='o'){e.preventDefault();actions.current.add?.();}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();actions.current.export?.();}};
  window.addEventListener('keydown',handler);const cleanup=window.qingtu?.onMenu(action=>action==='import'?actions.current.add?.():actions.current.export?.());
  return()=>{window.removeEventListener('keydown',handler);cleanup?.();};
 },[]);
 async function accept(result){
  if(result.items.length){await Promise.all(items.filter(i=>i.sample).map(i=>api.remove(i.id)));setItems(old=>[...old.filter(i=>!i.sample),...result.items]);setSelectedId(result.items[0].id);setResize(defaults);setStatuses({});}
  if(result.errors.length)setNotice({type:'error',text:result.errors.join('；')});
 }
 async function importFiles(files){
  if(batch||loading)return;const list=Array.from(files);if(!list.length)return;setLoading(true);setNotice(null);
  try{const result={items:[],errors:[]};for(const f of list){try{if(f.size>100*1048576)throw new Error('单张图片须小于 100 MB');const r=await api.importFiles([await readFile(f)]);result.items.push(...r.items);result.errors.push(...r.errors);}catch(e){result.errors.push(f.name+'：'+e.message);}}await accept(result);}
  catch(e){setNotice({type:'error',text:e.message});}finally{setLoading(false);if(fileInput.current)fileInput.current.value='';}
 }
 async function add(){if(batch||loading)return;if(!desktop){fileInput.current.click();return;}setLoading(true);try{await accept(await api.chooseFiles());}catch(e){setNotice({type:'error',text:e.message});}finally{setLoading(false);}}
 async function remove(id){if(batch)return;await api.remove(id);setItems(old=>old.filter(i=>i.id!==id));if(id===selectedId)setSelectedId(null);}
 async function chooseFolder(){try{const value=await api.chooseFolder();if(value)setFolder(value);return value;}catch(e){setNotice({type:'error',text:e.message});return null;}}
 async function exportAll(){
  if(!items.length||batch||loading||error)return;if(!folder&&!await chooseFolder())return;
  const files=[...items],config=structuredClone(settings);cancel.current=false;setBatch({current:0,total:files.length});setNotice(null);setStatuses({});let success=0,failed=0;
  for(let i=0;i<files.length;i++){
   if(cancel.current)break;const file=files[i];setBatch({current:i+1,total:files.length});setStatuses(old=>({...old,[file.id]:{type:'busy'}}));
   try{const r=await api.process(file.id,config);if(cancel.current){setStatuses(old=>({...old,[file.id]:{type:'idle',text:'已取消'}}));break;}await api.save(r.token);success++;setStatuses(old=>({...old,[file.id]:{type:'success',text:bytesText(r.bytes)}}));}
   catch(e){failed++;setStatuses(old=>({...old,[file.id]:{type:'error',text:e.message}}));}
  }
  setBatch(null);setNotice({type:failed?'error':'success',text:cancel.current?`已取消，导出 ${success} 张`:`已导出 ${success} 张${failed?`，${failed} 张未完成`:''}`,reveal:success>0&&desktop});
 }
 actions.current={add,export:exportAll};
 function editDimension(field,value){setResize(old=>({...old,type:'pixels',width:size.width,height:size.height,[field]:value,anchor:field}));}

 function reset(){setTarget(10);setUnit('MB');setFormat('png');setResize(defaults);setPreviewReset(v=>v+1);setError('');}
 const windowButtons=<div className="window-controls"><button aria-label="最小化" onClick={()=>api.windowAction('minimize')}><Minus size={16}/></button><button aria-label="最大化或还原" onClick={()=>api.windowAction('maximize')}><Square size={13}/></button><button className="window-close" aria-label="关闭窗口" onClick={()=>api.windowAction('close')}><X size={17}/></button></div>;
 return <div className={`app ${inspectorOpen?'':'inspector-collapsed'}`} onDragOver={e=>e.preventDefault()} onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')){depth.current++;setDragging(true);}}} onDragLeave={()=>{if(--depth.current<=0){setDragging(false);depth.current=0;}}} onDrop={e=>{e.preventDefault();depth.current=0;setDragging(false);importFiles(e.dataTransfer.files);}}>
  <header className={`titlebar ${isMac?'mac-titlebar':''}`}>
   <div className="brand"><img src="./assets/app-icon.png" alt="" draggable={false}/><strong>轻图</strong></div><AppUpdates busy={processing||loading||!!batch} hasImages={items.length>0}/>{desktop&&!isMac&&windowButtons}
  </header>
  <input ref={fileInput} className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff" aria-label="选择图片文件" onChange={e=>importFiles(e.target.files)}/>
  <main className="workspace">
   <ToolNavigation/>
   <section className="stage" aria-label="图片预览">
    <div className={`preview-workspace ${selected?'has-image':''} ${dragging?'dragging':''}`}>
     <div className="file-toolbar">
      <span className="file-toolbar-name">{selected?.name||'未选择图片'}</span>
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
        <span>{bytesText(selected.bytes)}<span className="info-arrow">→</span>{output?bytesText(output.bytes):processing?'计算中…':'—'}</span>
        <span>{selected.width} × {selected.height}{output&&(output.width!==selected.width||output.height!==selected.height)&&<> → {output.width} × {output.height}</>}</span>
        <span className="preview-status" title={output?`${output.lossless?'无损编码':`编码质量 ${output.quality}`} · ${output.bytes.toLocaleString()} 字节`:undefined}>{output?`${output.format==='jpeg'?'JPG':output.format.toUpperCase()} · ${output.bytes.toLocaleString()} 字节`:loading?'正在导入…':'就绪'}</span>
       </div>
      </div>:<div className="empty-state">
       <img className="empty-illustration" src="./assets/blue-file-empty.png" alt="" draggable={false}/>
       <button className="primary import-button" disabled={loading} onClick={add}>{loading?<SpinnerGap size={25} className="spin"/>:<Plus size={30} weight="bold"/>}{loading?'正在准备…':'添加图片'}</button>
      </div>}
     </div>
    </div>
    <div className="queue-region">
     <div className="queue-toolbar"><span>图片<span className="queue-count">{items.length}</span></span><button className="icon-button queue-clear" aria-label="清空图片" disabled={loading||!!batch||!items.length} onClick={()=>Promise.all(items.map(i=>remove(i.id)))}><Trash size={22} weight="bold"/></button></div>
     <div className="filmstrip" aria-label="图片队列">
      {items.map(file=><div className={`film-item ${file.id===selected?.id?'selected':''}`} key={file.id}>
       <button className="film-select" disabled={!!batch} aria-label={`预览 ${file.name}`} aria-pressed={file.id===selected?.id} onClick={()=>setSelectedId(file.id)}><img src={file.preview} alt={file.name}/></button>
       <button className="film-remove" disabled={!!batch} aria-label={`移除 ${file.name}`} onClick={()=>remove(file.id)}><X size={14} weight="bold"/></button>
       <span className="filename" title={file.name}>{file.name}</span>
       {statuses[file.id]&&<span className={`file-status ${statuses[file.id].type}`} title={statuses[file.id].text}>{statuses[file.id].type==='busy'?'处理中':statuses[file.id].text}</span>}
      </div>)}
      <div className="film-item add-item"><button className="add-tile" aria-label="添加图片" onClick={add} disabled={loading||!!batch}><Plus size={38} weight="bold"/></button><span className="filename">添加图片</span></div>
     </div>
    </div>
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
       <label htmlFor="target-size">大小</label>
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
      <div className="control-section format-section"><label htmlFor="format">格式</label><Dropdown id="format" label="输出格式" value={format} onChange={setFormat} disabled={!!batch||!inspectorOpen} options={[{value:'auto',label:'自动'},{value:'jpeg',label:'JPG'},{value:'png',label:'PNG'}]}/></div>
     </div>
     <div className="export-section">
      {error&&<div className="inline-message error" role="alert"><WarningCircle size={18}/><span>{error}</span></div>}
      <label>输出文件夹</label>
      <button className="folder-control" disabled={!!batch} onClick={chooseFolder} title={folder?.path}><FolderSimple size={24} weight="bold"/><span>{folder?.name||'选择文件夹'}</span></button>
      <button className="primary export-button" disabled={!items.length||loading||!!batch||!!error} onClick={exportAll}>{batch?<><SpinnerGap size={22} className="spin"/>导出 {batch.current} / {batch.total}</>:<>导出 {items.length} 张图片</>}</button>
      {batch&&<button className="cancel-button" onClick={()=>{cancel.current=true;}}>取消</button>}
     </div>
    </aside>
   </div>
  </main>
  {notice&&<div className={`notice ${notice.type}`} role={notice.type==='error'?'alert':'status'}>{notice.type==='error'?<WarningCircle size={23} weight="bold"/>:<CheckCircle size={23} weight="fill" className="success-icon"/>}<span>{notice.text}</span>{notice.reveal&&<button onClick={()=>api.revealFolder()}>打开文件夹</button>}<button className="icon-button" aria-label="关闭提示" onClick={()=>setNotice(null)}><X size={18}/></button></div>}
  {dragging&&<div className="drop-overlay"><Plus size={40} weight="bold"/><span>松开以添加图片</span></div>}
 </div>;
}
