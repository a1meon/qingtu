const defaultName='轻图output';
const access={mode:'readwrite'};

export function initialBrowserFolder(){
 return typeof window.showDirectoryPicker==='function'
  ? {path:'图片/'+defaultName,needsPermission:true}
  : {name:'系统下载目录',download:true};
}

async function pick(scope,startIn){
 try{return await window.showDirectoryPicker({id:'qingtu-'+scope,startIn,mode:'readwrite'});}
 catch(error){
  if(error.name==='AbortError')return null;
  if(error.name==='SecurityError'||error.name==='NotAllowedError')throw new Error('浏览器未允许访问目录，请在独立浏览器窗口或桌面版选择导出目录。');
  throw error;
 }
}

export async function chooseBrowserFolder(scope,current){
 if(typeof window.showDirectoryPicker!=='function')throw new Error('此浏览器使用系统下载位置。可在浏览器下载设置中更改，或在桌面版选择输出目录。');
 const directory=await pick(scope,current?.directory||'pictures');
 return directory?{path:directory.name,directory}:null;
}

export async function prepareBrowserFolder(scope,folder){
 if(folder.download)return folder;
 if(folder.directory){
  if(await folder.directory.requestPermission(access)!=='granted')throw new Error('目录未授权，请点击「选择目录」重新选择。');
  return folder;
 }
 const parent=await pick(scope,'pictures');
 if(!parent)return null;
 if(parent.name===defaultName)return {path:parent.name,directory:parent};
 const directory=await parent.getDirectoryHandle(defaultName,{create:true});
 return {path:parent.name+'/'+defaultName,directory};
}

export function writeBrowserFile(directory,name,blob){
 // Serialize name allocation across this app's tabs, including both modules.
 return navigator.locks.request('qingtu-output-file',async()=>{
  const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  for(let n=1;n<=10000;n++){
   const candidate=n===1?name:stem+'-'+n+ext;
   try{await directory.getFileHandle(candidate);continue;}
   catch(error){if(error.name==='TypeMismatchError')continue;if(error.name!=='NotFoundError')throw error;}
   const file=await directory.getFileHandle(candidate,{create:true}),stream=await file.createWritable();
   try{await stream.write(blob);await stream.close();}
   catch(error){await stream.abort().catch(()=>{});throw error;}
   return candidate;
  }
  throw new Error('同名文件过多，请更换保存目录');
 });
}
