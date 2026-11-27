import {useCallback,useEffect,useRef,useState} from 'react';
import {ClockCounterClockwise,FolderOpen,ImageSquare,X} from '@phosphor-icons/react';
import {Modal} from './Modal.jsx';
import {api,desktop} from './api.js';

const stamp=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const statusText={missing:'已删除或移动',unavailable:'暂时无法访问'};
// A page can contain many large originals. Only request small previews for
// tiles approaching the scrollport, with at most three decodes in flight.
const recentThumbnails=new Map();
function HistoryTiles({scope,items,onOpen}){
 const grid=useRef(null),[images,setImages]=useState({});
 useEffect(()=>{
  const element=grid.current,waiting=new Set(),entries=new Map(items.map(item=>[String(item.id),item]));
  let active=true,running=0;
  async function load(tile){
   const entry=entries.get(tile.dataset.id),key=scope+':'+entry.id;
   try{
    const url=await api.exportThumbnail(scope,entry.id);
    if(!url)return;
    recentThumbnails.set(key,url);
    if(recentThumbnails.size>90)recentThumbnails.delete(recentThumbnails.keys().next().value);
    if(active)setImages(previous=>({...previous,[entry.id]:url}));
   }catch{/* A missing preview still leaves the record accessible. */}
  }
  function drain(){
   while(active&&running<3&&waiting.size){
    const tile=waiting.values().next().value;
    waiting.delete(tile);observer.unobserve(tile);running++;
    load(tile).finally(()=>{running--;drain();});
   }
  }
  const observer=new IntersectionObserver(changes=>{
   for(const {target,isIntersecting} of changes){if(isIntersecting)waiting.add(target);else waiting.delete(target);}
   drain();
  },{root:element,rootMargin:'48px 0px'});
  for(const tile of element.children){
   const entry=entries.get(tile.dataset.id);
   if(!entry.thumbnail&&!recentThumbnails.has(scope+':'+entry.id)&&(desktop||entry.status==='saved'))observer.observe(tile);
  }
  return ()=>{active=false;waiting.clear();observer.disconnect();};
 },[scope,items]);
 return <ul ref={grid} className="history-list">{items.map(entry=>{
  const unavailable=statusText[entry.status],url=entry.thumbnail||images[entry.id]||recentThumbnails.get(scope+':'+entry.id);
  return <li key={entry.id} data-id={entry.id} className={unavailable?'history-unavailable':''}>
   <span className="history-thumbnail" tabIndex={url?0:undefined} aria-label={url?entry.name+' 缩略图':undefined}>{url?<img src={url} alt="" decoding="async" loading="lazy"/>:<ImageSquare size={26} aria-hidden/>}</span>
   <div className="history-file"><strong title={entry.name}>{entry.name}</strong><span title={entry.folder}>{entry.folder}</span>
    <small><time dateTime={new Date(entry.time).toISOString()}>{stamp.format(entry.time)}</time>{unavailable&&` · ${unavailable}`}</small>
   </div>
   {desktop&&<button type="button" className="history-open" disabled={!!unavailable} onClick={()=>onOpen(entry)} aria-label={`打开 ${entry.name} 的导出目录`} title={unavailable||'打开文件夹'}><FolderOpen size={16} aria-hidden/><span>打开文件夹</span></button>}
  </li>;
 })}</ul>;
}
export function ExportHistory({scope,onClose}){
 const [page,setPage]=useState(0),[result,setResult]=useState(null),[error,setError]=useState('');
 const request=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++request.current;
  try{const latest=await api.exportHistory(scope,page);if(id===request.current)setResult(latest);}
  catch(e){if(id===request.current)setError(e.message||'无法读取导出历史');}
 },[scope,page]);
 useEffect(()=>{
  setResult(null);setError('');refresh();
  window.addEventListener('focus',refresh);
  return ()=>{++request.current;window.removeEventListener('focus',refresh);};
 },[refresh]);
 async function open(entry){
  setError('');
  try{await api.revealExport(scope,entry.id);}catch(e){setError(e.message);await refresh();}
 }
 return <Modal label="导出历史" className="export-history-dialog" onKeyDown={e=>e.stopPropagation()} onCancel={onClose}>
  <header className="history-heading">
   <div><h2>导出历史</h2><p>{scope==='stitch'?'图像编辑':'压缩调整'}{result&&` · ${result.total} 条记录`}</p></div>
   <button type="button" className="icon-button" aria-label="关闭导出历史" onClick={onClose}><X size={20}/></button>
  </header>
  {error&&<p className="dialog-error" role="alert">{error}</p>}
  {result?.unsaved&&<p className="dialog-error" role="status">部分导出记录仅保存在本次会话中。</p>}
  {!result&&!error&&<p role="status">正在读取记录…</p>}
  {result?.total===0&&<div className="history-empty"><ClockCounterClockwise aria-hidden size={32}/><p>暂无导出记录</p></div>}
  {!!result?.items.length&&<>
   {!desktop&&result.items.some(item=>item.status==='download')&&<p className="history-download-note">请在浏览器的下载记录中打开文件所在目录。</p>}
   <HistoryTiles key={scope+result.page} scope={scope} items={result.items} onOpen={open}/>
   {result.pages>1&&<footer className="history-pages"><button disabled={result.page===0} onClick={()=>setPage(result.page-1)}>上一页</button><span>{result.page+1} / {result.pages}</span><button disabled={result.page+1>=result.pages} onClick={()=>setPage(result.page+1)}>下一页</button></footer>}
  </>}
 </Modal>;
}
