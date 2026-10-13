const {contextBridge,ipcRenderer}=require('electron');
const methods=['samples','chooseFiles','importFiles','process','remove','chooseFolder','save','revealFolder','windowAction','updateStatus','checkUpdate','downloadUpdate','installUpdate'];
const api=Object.fromEntries(methods.map(method=>[method,(...args)=>ipcRenderer.invoke('qingtu:call',method,args)]));
api.platform=process.platform;
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
