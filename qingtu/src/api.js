import {messageForUser} from './errors.js';
import appPackage from '../package.json';
export const desktop=!!window.qingtu;
async function call(method,...args){
 try{
  if(desktop)return await window.qingtu[method](...args);
  const res=await fetch('/__qingtu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});
  const payload=await res.json();
  if(!res.ok)throw new Error(payload.error||'本地处理失败');
  return payload.result;
 }catch(error){throw new Error(messageForUser(error));}
}
export const api={
  updateStatus:()=>desktop?call('updateStatus'):Promise.resolve({version:appPackage.version,phase:'preview',visible:false}),
  checkUpdate:()=>desktop?call('checkUpdate'):Promise.resolve({version:appPackage.version,phase:'preview',visible:true}),
  downloadUpdate:()=>desktop?call('downloadUpdate'):Promise.reject(new Error('请在桌面版更新')),
  installUpdate:()=>desktop?call('installUpdate'):Promise.reject(new Error('请在桌面版更新')),
  onUpdate:callback=>desktop?window.qingtu.onUpdate(callback):()=>{},
  samples:()=>call('samples'),
  chooseFiles:()=>call('chooseFiles'),
  importFiles:files=>call('importFiles',files),
  process:(id,settings,options)=>call('process',id,settings,options),
  remove:id=>call('remove',id),
  chooseFolder:()=>call('chooseFolder'),
  save:async token=>{
    const result=await call('save',token);
    if(!desktop){
      const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:result.mime}));
      const a=document.createElement('a');a.href=url;a.download=result.name;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    return result;
  },
  revealFolder:()=>desktop?call('revealFolder'):Promise.resolve(),
  windowAction:action=>desktop?call('windowAction',action):Promise.resolve()
};
export const readFile=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve({name:file.name,base64:String(reader.result).split(',')[1]});
  reader.onerror=()=>reject(new Error('读取图片失败'));
  reader.readAsDataURL(file);
});
