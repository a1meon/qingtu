let worker,active;
const queued=[];
function next(){
  if(active||!queued.length)return;
  active=queued.shift();
  try{
    if(!worker){
      worker=new Worker(new URL('./browser/browser-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        if(active?.id!==data.id)return;
        const job=active;active=null;
        if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);
        next();
      };
      worker.onerror=()=>{
        worker.terminate();worker=null;
        for(const job of [active,...queued.splice(0)])job?.reject(new Error('浏览器图片引擎已停止，请重新载入页面并导入图片'));
        active=null;
      };
    }
    const {id,method,args}=active;worker.postMessage({id,method,args});
  }catch(error){active.reject(error);active=null;next();}
}
function invoke(method,args){
  return new Promise((resolve,reject)=>{
    const preview=args.at(-1)?.latest&&['process','stitchRender'].includes(method);
    const key=preview?`${method}:${method==='process'?args[0]:args[0].id}`:null;
    if(key){const i=queued.findIndex(job=>job.key===key);if(i!==-1)queued.splice(i,1)[0].reject(new Error('预览参数已更新'));}
    queued.push({id:crypto.randomUUID(),method,args,key,resolve,reject});next();
  });
}
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取预览失败'));reader.readAsDataURL(blob);});
async function display(item){return {...item,preview:await dataUrl(item.preview)};}
export async function browserCall(method,...args){
  if(method==='stitchRelease'&&!worker)return true;
  if(method==='samples'){
    const files=await Promise.all(['alpine-lake','forest-cabin','coastline'].map(async stem=>{
      const name=`${stem}.jpg`,response=await fetch(new URL(`samples/${name}`,document.baseURI));
      if(!response.ok)throw new Error('示例图片加载失败');return new File([await response.blob()],name,{type:'image/jpeg'});
    }));
    return (await browserCall('importFiles',files,true)).items;
  }
  const result=await invoke(method,args);
  if(method==='importFiles')return {...result,items:await Promise.all(result.items.map(display))};
  if(method==='stitchPreviews')return Promise.all(result.map(dataUrl));
  return result?.preview instanceof Blob?display(result):result;
}
