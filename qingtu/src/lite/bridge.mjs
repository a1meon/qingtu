import * as N from '@neutralinojs/lib';
import {Buffer} from 'buffer';
import version from '../../package.json';
import {startNativeClient} from './startup.mjs';
export async function initialize(){
 await startNativeClient(N);
 const nativePending=new Map(),pending=new Map();let sequence=0,output='',folder=null,closing=false,helperFailure=null,workerFailure=null;let helper;
 const flushers=new Set(),menus=new Set(),updates=new Set();
 const quote=value=>globalThis.NL_OS==='Windows'?'"'+value.replaceAll('"','')+'"':"'"+value.replaceAll("'","'\\''")+"'";
 await N.events.on('spawnedProcess',ev=>{
  const m=ev.detail;if(m.id!==helper?.id)return;
  if(m.action==='stdOut'){output+=m.data;let at;while((at=output.indexOf('\n'))>=0){const line=output.slice(0,at);output=output.slice(at+1);if(!line)continue;const message=JSON.parse(line),p=nativePending.get(message.id);if(p){nativePending.delete(message.id);message.error?p.reject(Object.assign(new Error(message.error.message),{code:message.error.code})):p.resolve(message.result);}}}
  if(m.action==='exit'){helperFailure=new Error('文件服务已退出，请重新打开轻图');for(const p of nativePending.values())p.reject(helperFailure);nativePending.clear();}
 });
 helper=await N.os.spawnProcess(quote(globalThis.NL_PATH+'/'+(globalThis.NL_IO_PATH||'qingtu-io')+(globalThis.NL_OS==='Windows'?'.exe':'')));
 const native=(method,...args)=>new Promise((resolve,reject)=>{if(helperFailure)return reject(helperFailure);const id=++sequence;nativePending.set(id,{resolve,reject});N.os.updateSpawnedProcess(helper.id,'stdIn',JSON.stringify({id,method,args})+'\n').catch(error=>{nativePending.delete(id);reject(error);});});
 const info=await native('platform'),platform=info.os==='windows'?'win32':'darwin';
 const root=globalThis.NL_ARGS?.find(a=>a.startsWith('--qingtu-test-root='))?.split('=').slice(1).join('=')||await native('legacyRoot');
 const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
 worker.onmessage=async({data:m})=>{
  if(m.type==='native'){try{worker.postMessage({type:'nativeResult',id:m.id,result:await native(m.method,...m.args)});}catch(e){worker.postMessage({type:'nativeResult',id:m.id,error:{message:e.message,code:e.code}});}return;}
  const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Object.assign(new Error(m.error.message),{code:m.error.code})):p.resolve(m.result);
 };
 worker.onerror=e=>{workerFailure=new Error(e.message||'图像服务出错，请重新打开轻图');for(const p of pending.values())p.reject(workerFailure);pending.clear();};
 const call=(method,...args)=>new Promise((resolve,reject)=>{if(workerFailure)return reject(workerFailure);const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,args});});
 await call('init',root,platform);
 const flush=async()=>{for(const f of flushers)await f();await call('flush');};
 const close=async()=>{if(closing)return;closing=true;try{await flush();await N.os.updateSpawnedProcess(helper.id,'stdInEnd');await N.app.exit();}catch(e){closing=false;if(globalThis.NL_ARGS?.includes('--qingtu-smoke'))throw e;const answer=await N.os.showMessageBox('项目尚未保存',e.message+'。继续关闭会丢失尚未保存的操作，是否仍要关闭？','YES_NO','WARNING');if(answer==='YES')await N.app.exit();}};
 await N.events.on('windowClose',close);
 const filters=[{name:'图片',extensions:['jpg','jpeg','png','webp','avif','tif','tiff']}];
 const choose=async(stitch)=>{const paths=await N.os.showOpenDialog('添加图片',{multiSelections:true,filters});const result={items:[],errors:[]};for(const p of paths)try{if((await native('stat',p)).size>100*1024*1024)throw new Error('单张图片须小于 100 MB');const file={name:p.replaceAll('\\','/').split('/').at(-1),base64:await native('readFile',p)};if(stitch)result.items.push(await call('stitchImport',file));else {const imported=await call('importFiles',[file]);result.items.push(...imported.items);result.errors.push(...imported.errors);}}catch(e){result.errors.push(p+'：'+e.message);}return result;};
 const methods=['stitchList','stitchLoad','stitchSave','stitchDelete','stitchImport','stitchPreviews','stitchMissing','stitchRender','stitchRelease','importFiles','process','rename','remove'];
 let state={version:version.version,phase:'idle',visible:false};
 const api=Object.fromEntries(methods.map(method=>[method,(...args)=>call(method,...args)]));
 Object.assign(api,{platform,onFlush:f=>(flushers.add(f),()=>flushers.delete(f)),onMenu:f=>(menus.add(f),()=>menus.delete(f)),onUpdate:f=>(updates.add(f),()=>updates.delete(f)),
 samples:async()=>[],chooseFiles:()=>choose(false),stitchChooseFiles:()=>choose(true),
 chooseFolder:async()=>{const p=await N.os.showFolderDialog('选择保存位置',{defaultPath:folder||await N.os.getPath('pictures')});if(!p)return null;folder=p;return {name:p.replaceAll('\\','/').split('/').at(-1),path:p};},
 save:token=>{if(!folder)throw new Error('请先选择保存位置');return call('save',token,folder);},revealFolder:()=>folder?N.os.open(folder):true,
 windowAction:async action=>{if(action==='close')return close();if(action==='minimize')return N.window.minimize();if(action==='maximize')return (await N.window.isMaximized())?N.window.unmaximize():N.window.maximize();},
 updateStatus:async()=>state,checkUpdate:async()=>state,downloadUpdate:async()=>{throw new Error('请先检查更新');},installUpdate:async()=>{throw new Error('请先下载更新');}
 });
 window.qingtu=api;
 // Native chrome supplies the normal macOS title bar; keep Windows controls.
 document.documentElement.classList.add('lite-desktop');
 if(platform==='darwin')document.documentElement.classList.add('lite-mac');

 await N.events.on('mainMenuItemClicked',ev=>{if(['close','quit'].includes(ev.detail.id))close();else for(const f of menus)f(ev.detail.id);});
 await N.window.setMainMenu([...(platform==='darwin'?[{text:'轻图',menuItems:[{id:'quit',text:'退出轻图',shortcut:'q'}]}]:[]),{text:'文件',menuItems:[{id:'import',text:'添加图片',shortcut:platform==='darwin'?'o':'Ctrl+O'},{id:'export',text:'导出图片',shortcut:platform==='darwin'?'S':'Ctrl+Shift+S'},{id:'close',text:'关闭',shortcut:platform==='darwin'?'w':'Alt+F4'}]},...(platform==='darwin'?[{text:'编辑',menuItems:[{text:'撤销',action:'undo:',shortcut:'z'},{text:'重做',action:'redo:',shortcut:'Z'},{text:'剪切',action:'cut:',shortcut:'x'},{text:'复制',action:'copy:',shortcut:'c'},{text:'粘贴',action:'paste:',shortcut:'v'},{text:'全选',action:'selectAll:',shortcut:'a'}]}]:[])]);
 document.addEventListener('keydown',event=>{if(platform==='win32'&&event.ctrlKey&&event.key.toLowerCase()==='o'){event.preventDefault();for(const f of menus)f('import');}else if(platform==='win32'&&event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();for(const f of menus)f('export');}});
 return {api,native,call,flush,close,N,info,updates,setState(value){state=value;for(const f of updates)f(state);}};
}
