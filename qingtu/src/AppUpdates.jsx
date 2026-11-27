import {useEffect,useRef,useState} from 'react';
import {ArrowDown,CheckCircle,SpinnerGap,CloudSlash,X} from '@phosphor-icons/react';
import {api} from './api.js';
import {formatFileSize} from './export-format.js';
import appPackage from '../package.json';

export function AppUpdates({busy,hasImages}){
 const [state,setState]=useState({version:appPackage.version,phase:'idle',visible:false});
 const [opened,setOpened]=useState(false),[actionError,setActionError]=useState('');
 const dialog=useRef(),versionButton=useRef(),seen=useRef(null),eventReceived=useRef(false);
 useEffect(()=>{
  let live=true;
  const unsubscribe=api.onUpdate(next=>{if(live){eventReceived.current=true;setState(next);}});
  api.updateStatus().then(next=>{if(live&&!eventReceived.current)setState(next);}).catch(()=>{});
  return()=>{live=false;unsubscribe();};
 },[]);
 useEffect(()=>{
  const revision=`${state.phase}:${state.availableVersion||''}`;
  if(state.visible&&revision!==seen.current){seen.current=revision;setOpened(true);}
 },[state]);
 useEffect(()=>{
  if(opened&&!dialog.current.open)dialog.current.showModal();
  else if(!opened&&dialog.current.open)dialog.current.close();
 },[opened]);
 function close(){setOpened(false);setActionError('');versionButton.current?.focus();}
 async function act(method){
  setActionError('');
  try{setState(await api[method]());}catch(error){setActionError(error.message);}
 }
 function check(){setOpened(true);act('checkUpdate');}
 const phase=state.phase;
 const retryDownload=phase==='error'&&state.availableVersion&&state.failureStage!=='install';
 const titles={checking:'检查更新',available:'发现新版本',downloading:state.transferMode==='delta'?'正在下载增量更新':'正在下载',installing:'正在安装更新',ready:'更新已就绪',current:'已是最新版本',offline:'暂时无法连接',error:state.failureStage==='install'?'安装未完成':retryDownload?'下载未完成':'检查未完成',development:'开发预览版',unconfigured:'暂未开启更新',preview:'桌面版更新',idle:'检查更新'};
 const statusText={checking:'稍等一下…',available:`轻图 ${state.availableVersion}`,downloading:[state.transferMode&&state.transferBytes?formatFileSize(state.transferBytes):null,`${state.percent||0}%`].filter(Boolean).join(' · '),installing:'完成后自动打开',ready:`轻图 ${state.availableVersion}`,current:`当前版本 ${state.version}`,offline:'请联网后重试',error:state.message||'请稍后重试',development:'自动更新适用于已安装的正式版。',unconfigured:'更新源尚未配置',preview:'请在 Mac 或 Windows 桌面版检查更新',idle:''};
 const Icon=['checking','downloading','installing'].includes(phase)?SpinnerGap:['current','ready'].includes(phase)?CheckCircle:['offline','error'].includes(phase)?CloudSlash:ArrowDown;
 return <>
  <button ref={versionButton} className="version-button" aria-label={`版本 ${state.version}，检查更新`} title="检查更新" onClick={check}>v{state.version}{['available','ready'].includes(phase)&&<span className="update-dot" aria-hidden/>}</button>
  <dialog ref={dialog} className="update-dialog" aria-labelledby="update-title" aria-describedby="update-description" onCancel={event=>{event.preventDefault();close();}} onClose={()=>{if(!dialog.current.open)setOpened(false);}}>
   <button className="icon-button update-close" aria-label="关闭更新提示" onClick={close}><X size={18} weight="bold"/></button>
   <div className={`update-icon ${['checking','downloading','installing'].includes(phase)?'spin':''}`}><Icon size={32} weight="bold" aria-hidden/></div>
   <h2 id="update-title">{titles[phase]}</h2>
   <p id="update-description" aria-live="polite">{statusText[phase]}</p>
   {phase==='downloading'&&<progress max="100" value={state.percent||0} aria-label="更新下载进度"/>}
   {phase==='ready'&&hasImages&&<p className="update-detail">重启会清空当前图片队列</p>}
   {actionError&&<p className="update-error" role="alert">{actionError}</p>}
   <div className="update-actions">
    {['available','downloading','ready'].includes(phase)||retryDownload?<button className="update-secondary" onClick={close}>{phase==='downloading'?'后台下载':'稍后'}</button>:null}
    {(phase==='available'||retryDownload)&&<button autoFocus className="primary" onClick={()=>act('downloadUpdate')}>{retryDownload?'重新下载':'立即更新'}</button>}
    {phase==='ready'&&<button autoFocus className="primary" disabled={busy} onClick={()=>act('installUpdate')}>{busy?'处理完成后重启':'重启并更新'}</button>}
    {['offline','error'].includes(phase)&&!retryDownload&&<button autoFocus className="primary" onClick={check}>重新检查</button>}
    {['current','unconfigured','preview'].includes(phase)&&<button autoFocus className="primary" onClick={close}>知道了</button>}
   </div>
  </dialog>
 </>;
}
