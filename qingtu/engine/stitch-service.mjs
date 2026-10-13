import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {calculateLayout} from './stitch-layout.mjs';
import {encodeFaithfulPng} from './png-quality.mjs';
import {INPUT_OPTIONS} from './image.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {encodeJpeg} from './jpeg-quality.mjs';

export async function composeProject(project,store,{isObsolete}={}){
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};
 const layout=calculateLayout(project);let canvas=Buffer.alloc(layout.width*layout.height*4);
 for(const rect of layout.rects){
  check();const source=await store.readAsset(rect.assetId);check();
  const meta=await sharp(source,INPUT_OPTIONS).metadata(),image=project.images.find(i=>i.id===rect.id),rotated=[5,6,7,8].includes(meta.orientation);
  if(image.width!==(rotated?meta.height:meta.width)||image.height!==(rotated?meta.width:meta.height)||image.bytes!==source.length)throw new Error('原图副本与项目尺寸不一致，请检查项目数据');
  let pipeline=sharp(source,INPUT_OPTIONS).rotate().toColourspace('srgb');
  const geometry=imageGeometry(image,project.edits?.[image.id]);
  if(rect.proportionalCrop){
   // Round only at the export raster. Symmetric sides differ by at most one
   // output pixel; keeping the source height preserves the original scale.
   const fullWidth=Math.ceil(image.width/image.height*rect.height);
   if(fullWidth<rect.width)throw new Error('分辨率过低，无法保持左右裁剪，请增加长边');
   pipeline=pipeline.resize(fullWidth,rect.height,{fit:'fill'}).extract({left:Math.floor((fullWidth-rect.width)/2),top:0,width:rect.width,height:rect.height});
  }else if(rect.autoCrop){
   if(geometry.left||geometry.top)pipeline=pipeline.extract(geometry);
   const resized=await pipeline.resize({height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   pipeline=sharp(resized.data,{raw:resized.info}).extract({left:Math.floor((resized.info.width-rect.width)/2),top:0,width:rect.width,height:rect.height});
  }else {if(geometry.left||geometry.top)pipeline=pipeline.extract(geometry);pipeline=pipeline.resize(rect.width,rect.height,{fit:'fill'});}
  const part=await pipeline.ensureAlpha().raw().toBuffer();
  canvas=await sharp(canvas,{raw:{width:layout.width,height:layout.height,channels:4}}).composite([{input:part,raw:{width:rect.width,height:rect.height,channels:4},left:rect.x,top:rect.y}]).raw().toBuffer();
 }
 return {data:canvas,info:{width:layout.width,height:layout.height,channels:4},layout};
}
async function encodeProject(data,info,settings,options){
 const target=Number(settings.targetBytes??10000000);
 if(!Number.isInteger(target)||target<64||target>100000000)throw new Error('大小须为 64 字节–100 MB');
 const requested=settings.format||'png';if(!['png','jpeg','auto'].includes(requested))throw new Error('格式无效');
 const png=async()=>({...await encodeFaithfulPng(data,info,target,options),format:'png'});
 let result;
 if(requested==='png')result=await png();
 else if(requested==='auto'){
  try{result=await png();}catch(error){if(error.message==='预览参数已更新')throw error;let transparent=false;for(let i=3;i<data.length;i+=4)if(data[i]!==255){transparent=true;break;}if(transparent)throw error;}
 }
 if(!result){
  const flattened=await sharp(data,{raw:info}).flatten({background:'#fff'}).raw().toBuffer({resolveWithObject:true});
  result={...await encodeJpeg(flattened.data,flattened.info,target,options),format:'jpeg'};
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
   const options={isObsolete:()=>revision!==null&&revision!==this.revisions.get(copy.id)};
   const {data,info,layout}=await composeProject(copy,this.store,options);
   const output=await encodeProject(data,info,copy.export||{},options),token=randomUUID();
   if(options.isObsolete())throw new Error('预览参数已更新');
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
