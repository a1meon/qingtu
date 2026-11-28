const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('qingtuToy',{
 kind:()=>ipcRenderer.invoke('qingtu:toy-kind'),
 exit:()=>ipcRenderer.invoke('qingtu:toy-exit'),
 drag:(phase,x,y)=>ipcRenderer.send('qingtu:toy-drag',phase,x,y),
 interactive:value=>ipcRenderer.send('qingtu:toy-interactive',value===true),
 onDragCancel:callback=>{
  const handler=()=>callback();
  ipcRenderer.on('qingtu:toy-drag-cancel',handler);
  return ()=>ipcRenderer.removeListener('qingtu:toy-drag-cancel',handler);
 },
 onKind:callback=>{
  const handler=(_event,kind)=>callback(kind);
  ipcRenderer.on('qingtu:toy-kind',handler);
  return ()=>ipcRenderer.removeListener('qingtu:toy-kind',handler);
 }
});
