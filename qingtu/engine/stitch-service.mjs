import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {calculateLayout} from './stitch-layout.mjs';
import {encodeFaithfulPng} from './png-quality.mjs';
import {INPUT_OPTIONS} from './image.mjs';
import {imageGeometry} from './stitch-edits.mjs';

export async function composeProject(project,store){
 const layout=calculateLayout(project);let canvas=Buffer.alloc(layout.width*layout.height*4);
 for(const rect of layout.rects){
  const source=await store.readAsset(rect.assetId),meta=await sharp(source,INPUT_OPTIONS).metadata(),image=project.images.find(i=>i.id===rect.id),rotated=[5,6,7,8].includes(meta.orientation);
  if(image.width!==(rotated?meta.height:meta.width)||image.height!==(rotated?meta.width:meta.height)||image.bytes!==source.length)throw new Error('原图副本与项目尺寸不一致，请检查项目数据');
  let pipeline=sharp(source,INPUT_OPTIONS).rotate().toColourspace('srgb');
  const geometry=imageGeometry(image,project.edits?.[image.id]);
  if(geometry.left||geometry.top)pipeline=pipeline.extract(geometry);
  if(rect.autoCrop){
   const resized=await pipeline.resize({height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   pipeline=sharp(resized.data,{raw:resized.info}).extract({left:Math.floor((resized.info.width-rect.width)/2),top:0,width:rect.width,height:rect.height});
  }else pipeline=pipeline.resize(rect.width,rect.height,{fit:'fill'});
  const part=await pipeline.ensureAlpha().raw().toBuffer();
  canvas=await sharp(canvas,{raw:{width:layout.width,height:layout.height,channels:4}}).composite([{input:part,raw:{width:rect.width,height:rect.height,channels:4},left:rect.x,top:rect.y}]).raw().toBuffer();
 }
 return {data:canvas,info:{width:layout.width,height:layout.height,channels:4},layout};
}
async function encodeProject(data,info,settings){
 const target=Number(settings.targetBytes??10000000);
 if(!Number.isInteger(target)||target<64||target>100000000)throw new Error('大小须为 64 字节–100 MB');
 const requested=settings.format||'png';if(!['png','jpeg','auto'].includes(requested))throw new Error('格式无效');
 const png=async()=>({...await encodeFaithfulPng(data,info,target),format:'png'});
 let result;
 if(requested==='png')result=await png();
 else if(requested==='auto'){
  try{result=await png();}catch(error){let transparent=false;for(let i=3;i<data.length;i+=4)if(data[i]!==255){transparent=true;break;}if(transparent)throw error;}
 }
 if(!result){
  const base=sharp(data,{raw:info}).flatten({background:'#fff'});
  const encode=q=>base.clone().jpeg({quality:q,mozjpeg:true}).toBuffer();
  let buffer=await encode(100),quality=100;
  if(buffer.length>target){let low=1,high=99,best;while(low<=high){const q=Math.floor((low+high)/2),b=await encode(q);if(b.length<=target){best=b;quality=q;low=q+1;}else high=q-1;}if(!best)throw new Error('当前分辨率无法满足体积上限，请增加上限');buffer=best;}
  result={buffer,quality,lossless:false,format:'jpeg',encoding:'JPG'};
 }
 if(result.buffer.length>target)throw new Error('输出超过体积上限');
 return {...result,width:info.width,height:info.height,imageBytes:result.buffer.length,limitBytes:target,paddedBytes:0};
}
export class StitchService{
 constructor(store,images){this.store=store;this.images=images;this.pending=Promise.resolve();this.revisions=new Map();this.previews=new Map();}
 render(project,options={}){
  const copy=structuredClone(project);this.store.validate(copy);
  const revision=options?.latest===true?(this.revisions.get(copy.id)||0)+1:null;
  if(revision!==null)this.revisions.set(copy.id,revision);
  const task=this.pending.catch(()=>{}).then(async()=>{
   if(revision!==null&&revision!==this.revisions.get(copy.id))throw new Error('预览参数已更新');
   const {data,info,layout}=await composeProject(copy,this.store);
   const output=await encodeProject(data,info,copy.export||{}),token=randomUUID();
   const preview=await sharp(output.buffer).resize({width:1200,height:800,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   if(revision!==null){const previous=this.previews.get(copy.id);if(previous)this.images.results.delete(previous);this.previews.set(copy.id,token);}
   if(revision===null||output.buffer.length<=64*1024*1024){
    this.images.results.set(token,{id:copy.id,name:copy.name||'拼图',output,exportTask:revision===null});
    this.images.trimPreviews();
   }
   return {token,width:info.width,height:info.height,bytes:output.buffer.length,limitBytes:output.limitBytes,format:output.format,lossless:output.lossless,encoding:output.encoding,difference:output.difference,layout,preview:'data:image/png;base64,'+preview.toString('base64')};
  });this.pending=task;return task;
 }
 release(id){const token=this.previews.get(id);if(token)this.images.results.delete(token);this.previews.delete(id);this.revisions.delete(id);}
 flush(){return this.pending;}
}
