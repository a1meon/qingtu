import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { INPUT_OPTIONS, SUPPORTED, processImage } from './image.mjs';

const preview=async(buffer,bounds={width:1600,height:1200})=>{
  const {data,info}=await sharp(buffer,INPUT_OPTIONS).rotate().toColourspace('srgb')
    .resize({...bounds,fit:bounds.fit||'inside',withoutEnlargement:true,kernel:'linear',fastShrinkOnLoad:false})
    .png().toBuffer({resolveWithObject:true});
  return {url:'data:image/png;base64,'+data.toString('base64'),width:info.width,height:info.height};
};
export class ImageService {
  files=new Map(); results=new Map(); totalBytes=0;
  async add(buffer, name, sample=false) {
    if(!Buffer.isBuffer(buffer) || buffer.length>100*1024*1024) throw new Error('单张图片须小于 100 MB');
    if(this.files.size>=100 || this.totalBytes+buffer.length>500*1024*1024) throw new Error('队列最多 100 张、总大小 500 MB，请先移除部分图片');
    const meta=await sharp(buffer,INPUT_OPTIONS).metadata();
    if(!SUPPORTED.includes(meta.format)) throw new Error('支持 JPEG、PNG、WebP、AVIF 和 TIFF 图片');
    if(meta.pages>1) throw new Error('暂不支持动画或多页图片，以免丢失帧');
    const id=randomUUID();
    const rotated=[5,6,7,8].includes(meta.orientation);
    const originalPreview=await preview(buffer);
    const item={id,name:path.basename(String(name).replaceAll('\\','/')).slice(0,200),width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,bytes:buffer.length,format:meta.format,sample,preview:originalPreview.url,previewWidth:originalPreview.width,previewHeight:originalPreview.height};
    this.files.set(id,{buffer,item});this.totalBytes+=buffer.length;
    return item;
  }
  original(id) {
    const file=this.files.get(id);
    if(!file) throw new Error('图片已移除，请重新添加');
    return file;
  }
  async process(id,settings,options={}) {
    const file=this.original(id);
    const revision=options?.latest===true?(file.previewRevision=(file.previewRevision||0)+1):null;
    const job=(file.pending||Promise.resolve()).catch(()=>{}).then(()=>{
      if(revision!==null && revision!==file.previewRevision)throw new Error('预览参数已更新');
      return this.processQueued(id,settings);
    });
    file.pending=job;
    return job;
  }
  async processQueued(id,settings) {
    const file=this.original(id),key=JSON.stringify(settings);
    if(file.last?.key===key && this.results.has(file.last.result.token)) return file.last.result;
    const output=await processImage(file.buffer,settings);
    const token=randomUUID();
    const outputPreview=output.unchanged?{url:file.item.preview,width:file.item.previewWidth,height:file.item.previewHeight}:await preview(output.buffer,{width:file.item.previewWidth,height:file.item.previewHeight,fit:output.width===file.item.width&&output.height===file.item.height?'fill':'inside'});
    const result={token,bytes:output.buffer.length,imageBytes:output.imageBytes,paddedBytes:output.paddedBytes,width:output.width,height:output.height,format:output.format,quality:output.quality,lossless:output.lossless,limitBytes:output.limitBytes,unchanged:output.unchanged,preview:outputPreview.url,previewWidth:outputPreview.width,previewHeight:outputPreview.height};
    if(!this.files.has(id)) throw new Error('图片已移除');
    if(file.last) this.results.delete(file.last.result.token);
    this.results.set(token,{id,name:file.item.name,output});
    file.last={key,result};
    return result;
  }
  remove(id) {
    const file=this.files.get(id);
    if(file) this.totalBytes-=file.buffer.length;
    this.files.delete(id);
    for(const [token,value] of this.results) if(value.id===id) this.results.delete(token);
  }
  result(token) {
    const result=this.results.get(token);
    if(!result) throw new Error('处理结果已失效，请重新预览');
    return result;
  }
  async save(token,folder) {
    const {name,output}=this.result(token);
    const ext=output.format==='jpeg'?'jpg':output.format;
    const stem=path.parse(name).name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)||'image';
    for(let n=1;n<=10000;n++) {
      const destination=path.join(folder,`${stem}-qingtu${n===1?'':`-${n}`}.${ext}`);
      try {await fs.writeFile(destination,output.buffer,{flag:'wx'});return {path:destination,bytes:output.buffer.length};}
      catch(error){if(error.code!=='EEXIST') throw error;}
    }
    throw new Error('同名文件过多，请更换保存目录');
  }
  download(token) {
    const {name,output}=this.result(token);
    return {name:path.parse(name).name+'-qingtu.'+(output.format==='jpeg'?'jpg':output.format),base64:output.buffer.toString('base64'),mime:'image/'+output.format};
  }
}
