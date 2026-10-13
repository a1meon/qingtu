const {contextBridge,ipcRenderer}=require('electron');
const methods=['samples','chooseFiles','importFiles','process','remove','chooseFolder','save','revealFolder','windowAction','updateStatus','checkUpdate','downloadUpdate','installUpdate','stitchList','stitchLoad','stitchSave','stitchDelete','stitchImport','stitchChooseFiles','stitchPreviews','stitchMissing','stitchRender','stitchRelease'];
const api=Object.fromEntries(methods.map(method=>[method,(...args)=>ipcRenderer.invoke('qingtu:call',method,args)]));
api.platform=process.platform;
api.onFlush=callback=>{
 const handler=async(_event,id)=>{try{await callback();await ipcRenderer.invoke('qingtu:flushed',id);}catch(error){await ipcRenderer.invoke('qingtu:flushed',id,error.message);}};
 ipcRenderer.on('qingtu:flush',handler);ipcRenderer.invoke('qingtu:flushReady').catch(()=>{});return ()=>ipcRenderer.removeListener('qingtu:flush',handler);
};
api.onMenu=callback=>{
  const handler=(_event,action)=>callback(action);
  ipcRenderer.on('qingtu:menu',handler);
  return ()=>ipcRenderer.removeListener('qingtu:menu',handler);
};
api.onUpdate=callback=>{
 const handler=(_event,state)=>callback(state);
 ipcRenderer.on('qingtu:update',handler);
 return ()=>ipcRenderer.removeListener('qingtu:update',handler);
};
contextBridge.exposeInMainWorld('qingtu',api);
