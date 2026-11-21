import sharp from 'sharp';
import {encodeFaithfulPng,PngBudgetError} from './png-quality.mjs';

import {pngBudgetDimensions} from './image-dimensions.mjs';
export {pngBudgetDimensions};

export async function encodePngWithinBudget(data,info,target,{maxRatio,...options}={}){
 const check=()=>{if(options.isObsolete?.())throw new Error('预览参数已更新');};
 const originalLong=Math.max(info.width,info.height),strict=info.width*2===info.height*5||info.height*2===info.width*5,unit=strict?5:1;
 const finish=(result,size)=>{
  if(result.buffer.length>target)throw new Error('输出超过体积上限');
  return {...result,...size,requestedWidth:info.width,requestedHeight:info.height,autoResized:size.width!==info.width||size.height!==info.height,
   differenceReference:'output-sized raster',scalePercent:Math.min(size.width/info.width,size.height/info.height)*100};
 };
 let failure;
 try{return finish(await encodeFaithfulPng(data,info,target,options),{width:info.width,height:info.height});}
 catch(error){if(!(error instanceof PngBudgetError))throw error;failure=error;}
 check();
 let high=originalLong,low=0,best,attempts=0;
 let next=high*Math.sqrt(target/failure.faithfulBytes)*.98;
 while(high-low>unit){
  check();
  let edge=Math.floor(Math.max(unit,Math.min(high-unit,next))/unit)*unit;
  if(edge<=low)edge=Math.floor((low+high)/2/unit)*unit;
  edge=Math.max(unit,edge);
  const size=pngBudgetDimensions(info,edge,{maxRatio});
  const raster=await sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}}).resize(size.width,size.height,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
  check();attempts++;
  try{
   // Original-size lossless optimisation above uses level 9. Resolution
   // probes use fast, still lossless DEFLATE; this never changes pixel quality.
   const result=finish(await encodeFaithfulPng(raster.data,raster.info,target,{...options,key:undefined,compressionLevel:6,refinementLimit:1}),size);
   best=result;low=edge;
   // A bounded number of refinements prioritises detail without dozens of
   // expensive PNG encodes. Every selected candidate already meets the limit.
   if(result.buffer.length>=target*.985||attempts>=5)break;
   next=edge*Math.sqrt(target/result.buffer.length)*.995;
  }catch(error){
   if(!(error instanceof PngBudgetError))throw error;
   high=edge;
   if(edge===unit)break;
   next=edge*Math.sqrt(target/error.faithfulBytes)*.98;
   if(best&&attempts>=5)break;
  }
 }
 if(best)return best;
 // This boundary is below the UI's minimum (1 KB). A valid, full-colour PNG
 // still needs its header/chunks; do not disguise another format as PNG.
 throw new Error('此字节上限小于有效 PNG 文件所需体积，大小至少设置为 1 KB');
}
