import {messageForUser} from './errors.js';
import {initialBrowserFolder,chooseBrowserFolder,writeBrowserFile} from './browser-output-folder.js';
import {recordDownload,downloads,lastBrowserFolder} from './browser-download-history.js';
import appPackage from '../package.json';
export const desktop=!!window.qingtu;
export const staticBrowser=import.meta.env.PROD&&!desktop;
async function call(method,...args){
 try{
  if(desktop)return await window.qingtu[method](...args);
  if(staticBrowser)return await (await import('./browser-engine.js')).browserCall(method,...args);
  const res=await fetch('/__qingtu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});
  const payload=await res.json();
  if(!res.ok)throw new Error(payload.error||'本地处理失败');
  return payload.result;
 }catch(error){throw new Error(messageForUser(error));}
}
export const api={
  stitchList:()=>call('stitchList'),
  stitchLoad:id=>call('stitchLoad',id),
  stitchSave:project=>call('stitchSave',project),
  stitchDelete:id=>call('stitchDelete',id),
  stitchImport:file=>call('stitchImport',file),
  stitchChooseFiles:mode=>call('stitchChooseFiles',mode),
  stitchPreviews:ids=>call('stitchPreviews',ids),
  stitchMissing:ids=>call('stitchMissing',ids),
  stitchRender:(project,options)=>call('stitchRender',{...project,images:project.images.map(({preview,...image})=>image)},options),
  stitchRelease:id=>call('stitchRelease',id),
  updateStatus:()=>desktop?call('updateStatus'):Promise.resolve({version:appPackage.version,phase:'preview',visible:false}),
  checkUpdate:()=>desktop?call('checkUpdate'):Promise.resolve({version:appPackage.version,phase:'preview',visible:true}),
  downloadUpdate:()=>desktop?call('downloadUpdate'):Promise.reject(new Error('请在桌面版更新')),
  installUpdate:()=>desktop?call('installUpdate'):Promise.reject(new Error('请在桌面版更新')),
  onUpdate:callback=>desktop?window.qingtu.onUpdate(callback):()=>{},
  samples:()=>call('samples'),
  chooseFiles:()=>call('chooseFiles'),
  importFiles:files=>call('importFiles',files),
  process:(id,settings,options)=>call('process',id,settings,options),
  rename:(id,name)=>call('rename',id,name),
  remove:id=>call('remove',id),
  chooseFolder:(scope='compression',current)=>desktop?call('chooseFolder',scope):chooseBrowserFolder(scope,current),
  save:async(token,scope='compression',folder)=>{
    const result=await call('save',token,scope);
    if(!desktop){
      const blob=result.blob||new Blob([Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0))],{type:result.mime});
      if(folder?.directory)result.name=await writeBrowserFile(folder.directory,result.name,blob);
      else {
       const url=URL.createObjectURL(blob);
       const a=document.createElement('a');a.href=url;a.download=result.name;a.click();
       setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
      await recordDownload(scope,result.name,folder).catch(error=>console.warn('未能保存下载记录',error.message));
    }
    return result;
  },
  outputFolder:async scope=>desktop?call('outputFolder',scope):(await lastBrowserFolder(scope).catch(()=>null))||initialBrowserFolder(),
  exportHistory:(scope,page)=>desktop?call('exportHistory',scope,page):downloads(scope,page),
  revealExport:(scope,id)=>call('revealFolder',scope,id),
  revealFolder:(scope='compression')=>desktop?call('revealFolder',scope):Promise.resolve(),
  windowAction:action=>desktop?call('windowAction',action):Promise.resolve()
};
export const readFile=file=>staticBrowser?Promise.resolve(file):new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve({name:file.name,base64:String(reader.result).split(',')[1]});
  reader.onerror=()=>reject(new Error('读取图片失败'));
  reader.readAsDataURL(file);
});
