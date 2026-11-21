import {useCallback,useEffect,useRef,useState} from 'react';
import {ClockCounterClockwise,FolderOpen,ImageSquare,X} from '@phosphor-icons/react';
import {Modal} from './Modal.jsx';
import {api,desktop} from './api.js';

const stamp=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const statusText={missing:'已删除或移动',unavailable:'暂时无法访问'};
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
   <ul className="history-list">{result.items.map(entry=>{
    const unavailable=statusText[entry.status];
    return <li key={entry.id} className={unavailable?'history-unavailable':''}>
     <ImageSquare className="history-image-icon" size={22} aria-hidden/>
     <div className="history-file"><strong title={entry.name}>{entry.name}</strong><span title={entry.folder}>{entry.folder}</span>
      <small><time dateTime={new Date(entry.time).toISOString()}>{stamp.format(entry.time)}</time>{unavailable&&` · ${unavailable}`}</small>
     </div>
     {desktop&&<button type="button" className="history-open" disabled={!!unavailable} onClick={()=>open(entry)} aria-label={`打开 ${entry.name} 的导出目录`} title={unavailable||'打开文件夹'}><FolderOpen size={18} aria-hidden/><span>打开文件夹</span></button>}
    </li>;
   })}</ul>
   {result.pages>1&&<footer className="history-pages"><button disabled={result.page===0} onClick={()=>setPage(result.page-1)}>上一页</button><span>{result.page+1} / {result.pages}</span><button disabled={result.page+1>=result.pages} onClick={()=>setPage(result.page+1)}>下一页</button></footer>}
  </>}
 </Modal>;
}
