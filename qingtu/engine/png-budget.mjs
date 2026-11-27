import sharp from 'sharp';
import {deflate} from 'node:zlib';
import {promisify} from 'node:util';
import {encodeFaithfulPng,PngBudgetError} from './png-quality.mjs';
import {exactIndexedPng} from './indexed-png.mjs';
import {adaptivePng} from './adaptive-png.mjs';

const compress=promisify(deflate);
export async function encodePngWithinBudget(data,info,target,options={}){
 let result,losslessBytes;
 const deflate=bytes=>compress(bytes,{level:9});
 try{result=await encodeFaithfulPng(data,info,target,options);}
 catch(error){
  if(!(error instanceof PngBudgetError)||options.faithfulOnly)throw error;
  losslessBytes=error.losslessBytes;
 }
 if(!result?.lossless&&!options.faithfulOnly){
  if(options.isObsolete?.())throw new Error('预览参数已更新');
  const exact=await exactIndexedPng(data,info,target,deflate);
  if(exact)result={buffer:Buffer.from(exact.buffer,exact.byteOffset,exact.byteLength),lossless:true,quality:null,encoding:'无损调色板 PNG'};
 }
 if(!result){
  const adaptive=await adaptivePng(data,info,target,{
   losslessBytes,isObsolete:options.isObsolete,deflate,
   encodeRgb:pixels=>sharp(pixels,{raw:info}).png({compressionLevel:9,adaptiveFiltering:false,palette:false}).toBuffer(),
  });
  result={buffer:Buffer.from(adaptive.bytes.buffer,adaptive.bytes.byteOffset,adaptive.bytes.byteLength),encoding:adaptive.encoding,lossless:false,quality:null};
 }
 if(options.isObsolete?.())throw new Error('预览参数已更新');
 return {...result,width:info.width,height:info.height,requestedWidth:info.width,requestedHeight:info.height,
  autoResized:false,differenceReference:'output-sized raster',scalePercent:100};
}
