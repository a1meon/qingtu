import sharp from 'sharp';
import {PngBudgetError} from './png-budget-error.mjs';
import {createHash} from 'node:crypto';
import {BufferCache} from './buffer-cache.mjs';

const cache=new BufferCache();
const losslessFilters=new Map();
import {pixelDifference,prepareBoundedPixels as prepare} from './pixel-difference.mjs';
export {PngBudgetError,pixelDifference};
export function prepareBoundedPixels(data,info){return prepare(data,info,Buffer.from);}
export function boundedPixels(data,info,strength){return prepareBoundedPixels(data,info)(strength);}

export async function encodeFaithfulPng(data,info,target,{key,isObsolete,refinementLimit=Infinity,compressionLevel=9}={}){
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};check();
 key ||=createHash('sha256').update(data).digest('hex')+`:${info.width}x${info.height}:${info.channels}`;
 key+=`:level:${compressionLevel}`;
 const raw={width:info.width,height:info.height,channels:info.channels};
 let prepared;
 const candidates=new BufferCache(32*1024*1024,3);
 const encode=async(strength,adaptive)=>{
  check();
  const k=`${key}:bounded:${strength}:${adaptive}`;
  const existing=candidates.get(k)||cache.get(k);if(existing)return existing;
  if(strength)prepared??=prepareBoundedPixels(data,info);
  const pixels=strength?prepared(strength):data;
  const buffer=cache.set(k,await sharp(pixels,{raw}).png({palette:false,compressionLevel,adaptiveFiltering:adaptive}).toBuffer());
  check();
  // Keep a small, bounded set of neighbours even if the shared cache evicts
  // them. Large buffers are not retained by this temporary cache.
  candidates.set(k,buffer);
  return buffer;
 };
 let full;
 if(losslessFilters.has(key))full=await encode(0,losslessFilters.get(key));
 else {
  const settled=await Promise.allSettled([encode(0,true),encode(0,false)]);
  for(const result of settled)if(result.status==='rejected')throw result.reason;
  const originals=settled.map(result=>result.value),adaptive=originals[0].length<=originals[1].length;
  full=originals[adaptive?0:1];losslessFilters.set(key,adaptive);
  if(losslessFilters.size>256)losslessFilters.delete(losslessFilters.keys().next().value);
  const discarded=`${key}:bounded:0:${!adaptive}`;cache.delete(discarded);candidates.delete(discarded);
 }
 if(full.length<=target)return {buffer:full,lossless:true,quality:null,encoding:'全彩无损 PNG',difference:pixelDifference(data,data,info.channels)};
 let strongest=await encode(100,true);
 if(strongest.length>target)throw new PngBudgetError(full.length,strongest.length);
 let best=strongest,bestStrength=100,low=0,high=100,lowBytes=full.length,highBytes=strongest.length,iterations=0;
 while(high-low>1&&iterations<refinementLimit){
  const estimate=Math.ceil(low+(lowBytes-target)/(lowBytes-highBytes)*(high-low));
  const s=iterations++===0?90:iterations>5?Math.floor((low+high)/2):Math.max(low+1,Math.min(high-1,estimate)),candidate=await encode(s,true);
  if(candidate.length<=target){best=candidate;bestStrength=s;high=s;highBytes=candidate.length;}else {low=s;lowBytes=candidate.length;}
 }
 // Check adjacent strengths: encoded sizes need not be perfectly monotonic.
 for(let s=Number.isFinite(refinementLimit)?bestStrength:Math.max(1,bestStrength-2);s<bestStrength;s++){
  const candidate=await encode(s,true);
  if(candidate.length<=target&&(s<bestStrength||(s===bestStrength&&candidate.length>best.length))){best=candidate;bestStrength=s;}
 }
 const decoded=await sharp(best).raw().toBuffer();
 const difference=pixelDifference(data,decoded,info.channels);
 if(difference.maxError>2||difference.alphaMaxError!==0||difference.rmse>1.5)throw new PngBudgetError(full.length,full.length);
 return {buffer:best,lossless:false,quality:null,encoding:'全彩高保真 PNG',difference,strength:bestStrength};
}
