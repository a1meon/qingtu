import sharp from 'sharp';
import {pixelDifference} from './png-quality.mjs';

export async function encodeJpeg(data,info,target,{isObsolete}={}){
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};check();
 const encode=async(quality,chromaSubsampling,mozjpeg=false)=>{check();const buffer=await sharp(data,{raw:info}).jpeg({quality,chromaSubsampling,mozjpeg,optimiseCoding:true}).toBuffer();check();return buffer;};
 // Full chroma retains fine coloured edges. The fast Huffman encoder avoids
 // repeating mozjpeg's trellis/progressive optimisation during every probe.
 const full=await encode(100,'4:4:4');
 if(full.length<=target)return {buffer:full,quality:100,lossless:false,encoding:'JPG',chromaSubsampling:'4:4:4',mozjpeg:false};
 async function fitting(chromaSubsampling){
  let low=1,high=100,best;
  while(low<=high){const quality=Math.floor((low+high)/2),buffer=await encode(quality,chromaSubsampling);if(buffer.length<=target){best={buffer,quality,chromaSubsampling};low=quality+1;}else high=quality-1;}
  if(!best)return null;
  const decoded=await sharp(best.buffer).raw().toBuffer();
  return {...best,mozjpeg:false,difference:pixelDifference(data,decoded,info.channels)};
 }
 // A tight budget can make 4:4:4 require stronger luminance quantisation.
 // Compare actual decoded pixels rather than assuming its quality number wins.
 const settled=await Promise.allSettled([fitting('4:4:4'),fitting('4:2:0')]);
 for(const result of settled)if(result.status==='rejected')throw result.reason;
 const candidates=settled.map(result=>result.value).filter(Boolean);
 if(!candidates.length)throw new Error('当前尺寸无法达到此体积，请增加大小上限');
 candidates.sort((a,b)=>a.difference.rmse-b.difference.rmse||a.difference.maxError-b.difference.maxError);
 const fast=candidates[0];
 // Fast probes locate the useful range. Refine only that range with mozjpeg
 // so a tight ceiling does not trade away detail just to finish sooner.
 const chromaSubsampling=fast.chromaSubsampling;
 let quality=fast.quality,buffer=await encode(quality,chromaSubsampling,true),best,low=1,high=quality-1;
 if(buffer.length<=target){
  best={buffer,quality,chromaSubsampling,mozjpeg:true};
  low=quality+1;high=100;
  while(quality<100){const next=Math.min(100,quality+4),candidate=await encode(next,chromaSubsampling,true);if(candidate.length>target){low=quality+1;high=next-1;break;}quality=next;best={buffer:candidate,quality,chromaSubsampling,mozjpeg:true};low=quality+1;high=100;}
 }
 while(low<=high){const q=Math.floor((low+high)/2),candidate=await encode(q,chromaSubsampling,true);if(candidate.length<=target){best={buffer:candidate,quality:q,chromaSubsampling,mozjpeg:true};low=q+1;}else high=q-1;}
 if(best){const decoded=await sharp(best.buffer).raw().toBuffer();best.difference=pixelDifference(data,decoded,info.channels);if(best.difference.rmse<fast.difference.rmse)return {...best,lossless:false,encoding:'JPG'};}
 return {...fast,lossless:false,encoding:'JPG'};
}
