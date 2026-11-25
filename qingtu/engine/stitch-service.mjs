import {defaultCanvasName,nameOrDefault} from './output-name.mjs';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {stitchRenderKey,originalCanvasImage} from './stitch-render-input.mjs';
import {calculateLayout} from './stitch-layout.mjs';
import {encodeStitchPng} from './stitch-png.mjs';
import {INPUT_OPTIONS} from './image.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {encodeJpeg} from './jpeg-quality.mjs';
import {clipRectangle} from './canvas-clip.mjs';
import {rotatedImageBounds} from './image-rotation.mjs';
import {sourceWindow,imageRotation,imageAngle} from './image-source.mjs';
import {applyImageColor} from './image-color.mjs';

export async function composeProject(project,store,{isObsolete}={}){
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};
 const layout=calculateLayout(project),sourceFormats=new Set();let canvas=Buffer.alloc(layout.width*layout.height*4);
 for(const pose of layout.rects){
  check();
  const rect=layout.fixed?{...pose,x:Math.round(pose.x),y:Math.round(pose.y),width:Math.max(1,Math.round(pose.x+pose.width)-Math.round(pose.x)),height:Math.max(1,Math.round(pose.y+pose.height)-Math.round(pose.y))}:pose;
  const image=project.images.find(i=>i.id===rect.id),fine=imageAngle(image),rotationRect=fine?{...rect,x:pose.x+(pose.width-rect.width)/2,y:pose.y+(pose.height-rect.height)/2}:rect,bounds=rotatedImageBounds(rotationRect,fine);
  if(bounds.x+bounds.width<=0||bounds.y+bounds.height<=0||bounds.x>=layout.width||bounds.y>=layout.height)continue;
  if(fine&&Math.ceil(bounds.width)*Math.ceil(bounds.height)>100000000)throw new Error('旋转图像过大，请缩小图片');
  const clipped=fine?{left:rect.x,top:rect.y,width:rect.width,height:rect.height,sourceLeft:0,sourceTop:0}:clipRectangle(rect,layout);
  if(!clipped)continue;
  const source=await store.readAsset(rect.assetId);check();
  const meta=await sharp(source,INPUT_OPTIONS).metadata(),rotated=[5,6,7,8].includes(meta.orientation),window=sourceWindow(image);
  sourceFormats.add(meta.format);
  const angle=imageRotation(image),baseWidth=rotated?meta.height:meta.width,baseHeight=rotated?meta.width:meta.height;
  if(window.fullWidth!==(angle%180?baseHeight:baseWidth)||window.fullHeight!==(angle%180?baseWidth:baseHeight)||image.bytes!==source.length)throw new Error('原图副本与项目尺寸不一致，请检查项目数据');
  let pipeline=sharp(source,INPUT_OPTIONS).rotate().toColourspace('srgb');
  if(angle){
   // Auto-orient EXIF first. Sharp supports only one explicit rotation per
   // pipeline; separate raw stages retain every oriented source pixel.
   const oriented=await pipeline.ensureAlpha().raw().toBuffer({resolveWithObject:true});check();
   const turned=await sharp(oriented.data,{raw:oriented.info}).rotate(angle).raw().toBuffer({resolveWithObject:true});check();
   pipeline=sharp(turned.data,{raw:turned.info});
  }
  const geometry=imageGeometry(image,project.edits?.[image.id]);
  if(rect.proportionalCrop){
   if(image.source)pipeline=pipeline.extract({left:window.left,top:window.top,width:window.width,height:window.height});
   // Round only at the export raster, retaining source scale along the
   // uncropped axis. Opposing cuts differ by at most one output pixel.
   const edit=project.edits[image.id];
   if(edit.axis==='vertical'){
    const fullHeight=layout.fixed?Math.ceil(rect.height/(1-2*edit.fraction)-1e-9):Math.ceil(image.height/image.width*rect.width);
    if(fullHeight<rect.height)throw new Error('分辨率过低，无法保持上下裁剪，请增加长边');
    pipeline=pipeline.resize(rect.width,fullHeight,{fit:'fill'}).extract({left:clipped.sourceLeft,top:Math.floor((fullHeight-rect.height)/2)+clipped.sourceTop,width:clipped.width,height:clipped.height});
   }else{
    const fullWidth=layout.fixed?Math.ceil(rect.width/(1-2*edit.fraction)-1e-9):Math.ceil(image.width/image.height*rect.height);
    if(fullWidth<rect.width)throw new Error('分辨率过低，无法保持左右裁剪，请增加长边');
    pipeline=pipeline.resize(fullWidth,rect.height,{fit:'fill'}).extract({left:Math.floor((fullWidth-rect.width)/2)+clipped.sourceLeft,top:clipped.sourceTop,width:clipped.width,height:clipped.height});
   }
  }else if(rect.autoCrop){
   if(geometry.left||geometry.top)pipeline=pipeline.extract(geometry);
   const resized=await pipeline.resize({height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   pipeline=sharp(resized.data,{raw:resized.info}).extract({left:Math.floor((resized.info.width-rect.width)/2),top:0,width:rect.width,height:rect.height});
  }else {if(image.source||geometry.width!==image.width||geometry.height!==image.height)pipeline=pipeline.extract({left:window.left+geometry.left,top:window.top+geometry.top,width:geometry.width,height:geometry.height});pipeline=pipeline.resize(rect.width,rect.height,{fit:'fill'});if(layout.fixed)pipeline=pipeline.extract({left:clipped.sourceLeft,top:clipped.sourceTop,width:clipped.width,height:clipped.height});}
  let part=await pipeline.ensureAlpha().raw().toBuffer(),destination=clipped;
  applyImageColor(part,image.color);
  if(fine){
   const turned=await sharp(part,{raw:{width:clipped.width,height:clipped.height,channels:4}}).rotate(fine,{background:'#00000000'}).raw().toBuffer({resolveWithObject:true});check();
   destination=clipRectangle({x:Math.round(pose.x+pose.width/2-turned.info.width/2),y:Math.round(pose.y+pose.height/2-turned.info.height/2),width:turned.info.width,height:turned.info.height},layout);
   if(!destination)continue;
   part=await sharp(turned.data,{raw:turned.info}).extract({left:destination.sourceLeft,top:destination.sourceTop,width:destination.width,height:destination.height}).raw().toBuffer();
  }
  canvas=await sharp(canvas,{raw:{width:layout.width,height:layout.height,channels:4}}).composite([{input:part,raw:{width:destination.width,height:destination.height,channels:4},left:destination.left,top:destination.top}]).raw().toBuffer();
 }
 return {data:canvas,info:{width:layout.width,height:layout.height,channels:4},layout,sourceFormats:[...sourceFormats]};
}
async function encodeProject(data,info,settings,options){
 const target=Number(settings.targetBytes??10000000);
 if(!Number.isInteger(target)||target<64||target>100000000)throw new Error('大小须为 64 字节–100 MB');
 const requested=settings.format||'png';if(!['png','jpeg','auto'].includes(requested))throw new Error('格式无效');
 const png=async()=>({...await encodeStitchPng(data,info,target,options),format:'png'});
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
 return {...result,width:result.width??info.width,height:result.height??info.height,imageBytes:result.buffer.length,limitBytes:target,paddedBytes:0};
}
export class StitchService{
 constructor(store,images){this.store=store;this.images=images;this.pending=Promise.resolve();this.revisions=new Map();this.previews=new Map();this.ready=new Map();}
 render(project,options={}){
  const copy=structuredClone(project);this.store.validate(copy);
  const name=nameOrDefault(copy.name,defaultCanvasName(copy));
  const key=stitchRenderKey(copy);
  const revision=options?.latest===true?(this.revisions.get(copy.id)||0)+1:null;
  if(revision!==null)this.revisions.set(copy.id,revision);
  const task=this.pending.catch(()=>{}).then(async()=>{
   if(revision!==null&&revision!==this.revisions.get(copy.id))throw new Error('预览参数已更新');
   const cached=this.ready.get(copy.id),stored=cached?.key===key&&this.images.results.get(cached.result.token);
   if(stored){
    this.ready.delete(copy.id);this.ready.set(copy.id,cached);
    if(revision!==null)return {...cached.result};
    const token=randomUUID();this.images.results.set(token,{...stored,name,exportTask:true});return {...cached.result,token};
   }
   const options={isObsolete:()=>revision!==null&&revision!==this.revisions.get(copy.id)};
   const layout=calculateLayout(copy),original=originalCanvasImage(copy,layout);
   let output;
   if(original){
    const buffer=await this.store.readAsset(original.assetId),meta=await sharp(buffer,INPUT_OPTIONS).metadata();
    const rotated=[5,6,7,8].includes(meta.orientation);
    if(buffer.length!==original.bytes||(rotated?meta.height:meta.width)!==layout.width||(rotated?meta.width:meta.height)!==layout.height)throw new Error('原图副本与项目尺寸不一致');
    if(meta.format===copy.export?.format)output={buffer,width:layout.width,height:layout.height,format:meta.format,unchanged:true,lossless:true,encoding:'原图',imageBytes:buffer.length,limitBytes:copy.export.targetBytes,paddedBytes:0};
   }
   if(!output){
    const {data,info,sourceFormats}=await composeProject(copy,this.store,options);
    output=await encodeProject(data,info,copy.export||{},options);
    output.sourceFormats=sourceFormats;
   }
   const token=randomUUID();
   if(options.isObsolete())throw new Error('预览参数已更新');
   const preview=await sharp(output.buffer,INPUT_OPTIONS).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   if(options.isObsolete())throw new Error('预览参数已更新');
   if(revision!==null){const previous=this.previews.get(copy.id);if(previous)this.images.results.delete(previous);this.previews.set(copy.id,token);}
   if(revision===null||output.buffer.length<=64*1024*1024){
    this.images.results.set(token,{id:copy.id,name,canvas:true,output,exportTask:revision===null});
    this.images.trimPreviews();
   }
   const result={token,sourceFormats:output.sourceFormats||[output.format],width:output.width,height:output.height,requestedWidth:output.requestedWidth,requestedHeight:output.requestedHeight,autoResized:output.autoResized,scalePercent:output.scalePercent,differenceReference:output.differenceReference,bytes:output.buffer.length,imageBytes:output.imageBytes,paddedBytes:output.paddedBytes,limitBytes:output.limitBytes,format:output.format,unchanged:output.unchanged,quality:output.quality,lossless:output.lossless,encoding:output.encoding,difference:output.difference,layout,preview:'data:image/png;base64,'+preview.toString('base64')};
   this.ready.delete(copy.id);this.ready.set(copy.id,{key,result});if(this.ready.size>8){const oldest=this.ready.keys().next().value;this.ready.delete(oldest);const token=this.previews.get(oldest);if(token)this.images.results.delete(token);this.previews.delete(oldest);}
   return result;
  });this.pending=task;return task;
 }
 release(id){const token=this.previews.get(id);if(token)this.images.results.delete(token);this.previews.delete(id);this.revisions.delete(id);this.ready.delete(id);}
 flush(){return this.pending;}
}
