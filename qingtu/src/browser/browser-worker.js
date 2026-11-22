import {initializeImageMagick} from '@imagemagick/magick-wasm';
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url';
import {inspect,preview,encode} from './codec.js';
import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {fullCanvasImage,stitchRenderKey} from '../../engine/stitch-render-input.mjs';
import {PreviewCache} from '../../engine/preview-cache.mjs';
import {compose} from './compose.js';
import {readAsset} from '../stitch/database.js';
import {exportStem,compressionRename,defaultCanvasName,nameOrDefault} from '../../engine/output-name.mjs';

const files=new Map(),exportsByToken=new Map();
const cache=new PreviewCache(),pending=new Map();
let init,totalBytes=0;
function pin(result,owner,latest){
  const {blob,...summary}=result;
  if(latest)return summary;
  const token=crypto.randomUUID();
  const stem=exportStem({...owner,output:summary});
  exportsByToken.set(token,{blob,name:`${stem}.${summary.format==='jpeg'?'jpg':summary.format}`,bytes:blob.size});
  return {...summary,token};
}
async function cached(id,key,operation){
  const entry=cache.get(id);
  if(entry?.key===key)return entry.result;
  if(pending.get(id)?.key===key)return pending.get(id).task;
  const task=operation();pending.set(id,{key,task});
  try{
    const result=await task;
    if(pending.get(id)?.task===task)cache.set(id,{key,result},result.bytes+result.preview.size);
    return result;
  }finally{if(pending.get(id)?.task===task)pending.delete(id);}
}
function original(id){const entry=files.get(id);if(!entry)throw new Error('图片已移除，请重新添加');return entry;}
async function metadata(file,stitch=false,sample=false){
  const {bytes,meta}=await inspect(file);
  if(stitch&&meta.depth>8)throw new Error('图像编辑支持单帧 8 位 JPEG、PNG、WebP、AVIF、TIFF');
  const id=crypto.randomUUID(),name=file.name.replaceAll('\\','/').split('/').pop().slice(0,200);
  const item={id,name,width:meta.width,height:meta.height,bytes:file.size,...preview(bytes)};
  if(stitch){
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    return {...item,format:meta.format,assetId:Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('')};
  }
  files.set(id,{file,meta,name,originalName:name});totalBytes+=file.size;
  return {...item,format:meta.format,sample};
}
const actions={
  async importFiles(inputs,sample=false){
    const items=[],errors=[];
    for(const file of inputs){try{
      if(files.size>=100||totalBytes+file.size>500*1024*1024)throw new Error('队列最多 100 张、总大小 500 MB，请先移除部分图片');
      items.push(await metadata(file,false,sample));
    }catch(error){errors.push(`${file.name}：${error.message}`);}}
    return {items,errors};
  },
  async process(id,settings,options){
    const entry=original(id),result=await cached(id,JSON.stringify(settings),()=>encode(entry.file,entry.meta,settings));
    return pin(result,entry,options?.latest);
  },
  rename(id,name){const entry=original(id);Object.assign(entry,compressionRename(name,entry.originalName));return {id,name:entry.name};},
  remove(id){const entry=files.get(id);if(entry){totalBytes-=entry.file.size;files.delete(id);}cache.delete(id);pending.delete(id);return true;},
  stitchImport:file=>metadata(file,true),
  async stitchPreviews(ids){
    const images=[];for(const id of ids){const file=await readAsset(id);if(!file)throw new Error('原图副本缺失，项目无法恢复');images.push(preview(new Uint8Array(await file.arrayBuffer())).preview);}return images;
  },
  async stitchRender(project,options){
    const result=await cached(project.id,stitchRenderKey(project),async()=>{
      const layout=calculateLayout(project),original=fullCanvasImage(project,layout);
      if(original){
        const file=await readAsset(original.assetId);
        if(!file)throw new Error('原图副本缺失，项目无法恢复');
        const {meta}=await inspect(file);
        if(file.size!==original.bytes||meta.width!==original.width||meta.height!==original.height)throw new Error('原图副本与项目尺寸不一致');
        const resize={type:'pixels',locked:false,width:layout.width,height:layout.height};
        return {...await encode(file,meta,{...project.export,resize}),sourceFormats:[meta.format],layout};
      }
      const {blob,sourceFormats}=await compose(project,layout);
      const output=await encode(blob,{width:layout.width,height:layout.height,format:'png',depth:8},project.export);
      return {...output,unchanged:false,layout,sourceFormats};
    });
    return pin(result,{name:nameOrDefault(project.name,defaultCanvasName(project)),canvas:true},options?.latest);
  },
  stitchRelease(id){cache.delete(id);pending.delete(id);return true;},
  save(token){const result=exportsByToken.get(token);if(!result)throw new Error('处理结果已失效，请重新导出');exportsByToken.delete(token);return result;}
};
self.onmessage=async({data:{id,method,args}})=>{
  try{
    init??=initializeImageMagick(new URL(wasmUrl,self.location.href)).catch(error=>{init=null;throw error;});await init;
    self.postMessage({id,result:await actions[method](...args)});
  }catch(error){self.postMessage({id,error:error.message||'图片处理失败'});}
};
