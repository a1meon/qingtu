import sharp from 'sharp';
import {encodePngWithinBudget} from './png-budget.mjs';

// Layout edits do not need maximum DEFLATE effort when a fast full-colour,
// exactly lossless PNG already fits. Tight budgets retain the proven search.
export async function encodeStitchPng(data,info,target,options={}){
 const check=()=>{if(options.isObsolete?.())throw new Error('预览参数已更新');};check();
 if(info.width*info.height>=1000000){
  const buffer=await sharp(data,{raw:info}).png({compressionLevel:3,adaptiveFiltering:true,palette:false}).toBuffer();check();
  // Flat/simple content is cheap to minimise and should retain its smaller PNG.
  if(buffer.length<=target&&buffer.length>data.length*.01)return {buffer,width:info.width,height:info.height,requestedWidth:info.width,requestedHeight:info.height,autoResized:false,scalePercent:100,differenceReference:'output-sized raster',lossless:true,quality:null,encoding:'全彩无损 PNG',difference:{maxError:0,alphaMaxError:0,mae:0,rmse:0,psnr:null}};
 }
 return encodePngWithinBudget(data,info,target,{...options,maxRatio:2.5});
}
