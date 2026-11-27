const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('qingtuToy',{
 kind:()=>ipcRenderer.invoke('qingtu:toy-kind'),
 exit:()=>ipcRenderer.invoke('qingtu:toy-exit'),
 drag:(phase,x,y)=>ipcRenderer.send('qingtu:toy-drag',phase,x,y),
 onKind:callback=>{
  const handler=(_event,kind)=>callback(kind);
  ipcRenderer.on('qingtu:toy-kind',handler);
  return ()=>ipcRenderer.removeListener('qingtu:toy-kind',handler);
 }
});
