import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {BufferCache} from './buffer-cache.mjs';

const cache=new BufferCache();
const losslessFilters=new Map();
export function pixelDifference(a,b,channels=4){
 let squares=0,absolute=0,max=0,alphaMax=0,count=0;
 for(let i=0;i<a.length;i++){
  const d=Math.abs(a[i]-b[i]);
  if(channels===4&&i%4===3){alphaMax=Math.max(alphaMax,d);continue;}
  squares+=d*d;absolute+=d;max=Math.max(max,d);count++;
 }
 const mse=squares/count;
 return {maxError:max,alphaMaxError:alphaMax,mae:absolute/count,rmse:Math.sqrt(mse),psnr:mse?10*Math.log10(255*255/mse):null};
}

// Full-colour bounded-error preprocessing, never an indexed palette. Alpha,
// flat regions, smooth ramps and strong edges remain exact. RGB error <= 2/255.
export function prepareBoundedPixels(data,info){
 const {width,height,channels}=info;
 const ranked=new Uint8Array(width*height);ranked.fill(255);
 const step=5;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=(y*width+x)*channels;
  if(channels===4&&data[i+3]===0)continue;
  let contrast=0;
  for(let c=0;c<3;c++)for(const delta of [-channels,channels,-width*channels,width*channels])contrast=Math.max(contrast,Math.abs(data[i+c]-data[i+c+delta]));
  if(contrast<=2||contrast>=48)continue;
  // Stable spatial distribution lets the budget search vary continuously.
  const rank=((Math.imul(x,73856093)^Math.imul(y,19349663))>>>0)%100;
  if(data[i]===Math.min(255,Math.round(data[i]/step)*step)&&data[i+1]===Math.min(255,Math.round(data[i+1]/step)*step)&&data[i+2]===Math.min(255,Math.round(data[i+2]/step)*step))continue;
  ranked[y*width+x]=rank;
 }
 return strength=>{
  const out=Buffer.from(data);
  for(let pixel=0;pixel<ranked.length;pixel++)if(ranked[pixel]<strength){const i=pixel*channels;for(let c=0;c<3;c++)out[i+c]=Math.min(255,Math.round(data[i+c]/step)*step);}
  return out;
 };
}
export function boundedPixels(data,info,strength){return prepareBoundedPixels(data,info)(strength);}

export async function encodeFaithfulPng(data,info,target,{key,isObsolete}={}){
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};check();
 key ||=createHash('sha256').update(data).digest('hex')+`:${info.width}x${info.height}:${info.channels}`;
 const raw={width:info.width,height:info.height,channels:info.channels};
 let prepared;
 const candidates=new BufferCache(32*1024*1024,3);
 const encode=async(strength,adaptive)=>{
  check();
  const k=`${key}:bounded:${strength}:${adaptive}`;
  const existing=candidates.get(k)||cache.get(k);if(existing)return existing;
  if(strength)prepared??=prepareBoundedPixels(data,info);
  const pixels=strength?prepared(strength):data;
  const buffer=cache.set(k,await sharp(pixels,{raw}).png({palette:false,compressionLevel:9,adaptiveFiltering:adaptive}).toBuffer());
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
 if(strongest.length>target)throw new Error('保持当前分辨率与高保真 PNG 无法满足体积上限，请增加上限');
 let best=strongest,bestStrength=100,low=0,high=100,lowBytes=full.length,highBytes=strongest.length,iterations=0;
 while(high-low>1){
  const estimate=Math.ceil(low+(lowBytes-target)/(lowBytes-highBytes)*(high-low));
  const s=iterations++===0?90:iterations>5?Math.floor((low+high)/2):Math.max(low+1,Math.min(high-1,estimate)),candidate=await encode(s,true);
  if(candidate.length<=target){best=candidate;bestStrength=s;high=s;highBytes=candidate.length;}else {low=s;lowBytes=candidate.length;}
 }
 // Check adjacent strengths: encoded sizes need not be perfectly monotonic.
 for(let s=Math.max(1,bestStrength-2);s<bestStrength;s++){
  const candidate=await encode(s,true);
  if(candidate.length<=target&&(s<bestStrength||(s===bestStrength&&candidate.length>best.length))){best=candidate;bestStrength=s;}
 }
 const decoded=await sharp(best).raw().toBuffer();
 const difference=pixelDifference(data,decoded,info.channels);
 if(difference.maxError>2||difference.alphaMaxError!==0||difference.rmse>1.5)throw new Error('PNG 画质校验未通过，请增加体积上限');
 return {buffer:best,lossless:false,quality:null,encoding:'全彩高保真 PNG',difference,strength:bestStrength};
}
