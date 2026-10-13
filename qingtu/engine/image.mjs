import sharp from 'sharp';
import {padToExactSize} from './exact-size.mjs';
import {createHash} from 'node:crypto';
import {BufferCache} from './buffer-cache.mjs';

// Cache only pre-padding encoded bytes. Limits still apply independently to
// every request, and source content + output dimensions prevent stale reuse.
const encodedPngs=new BufferCache();

sharp.cache({memory:64,files:0,items:20});
sharp.concurrency(2);
export const INPUT_OPTIONS = { limitInputPixels: 100_000_000, failOn: 'warning' };
export const SUPPORTED = ['jpeg','png','webp','avif','heif','tiff'];

export function dimensions(meta, resize = {type:'scale',percent:100}) {
  let width, height;
  if (resize.type === 'scale') {
    const percent = Number(resize.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 400) throw new Error('缩放比例须为 0.1–400%');
    width = Math.max(1, Math.round(meta.width * percent / 100));
    height = Math.max(1, Math.round(meta.height * percent / 100));
  } else {
    width = Number(resize.width); height = Number(resize.height);
    if (resize.locked) {
      if (resize.anchor === 'height') width = Math.round(height * meta.width / meta.height);
      else height = Math.round(width * meta.height / meta.width);
    }
  }
  if (![width,height].every(v => Number.isInteger(v) && v > 0 && v <= 16384) || width * height > 100_000_000) throw new Error('尺寸须为 1–16384 像素，且总像素不超过 1 亿');
  return {width,height};
}

function stripJpegMetadata(buffer) {
  const chunks = [buffer.subarray(0,2)];
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error('JPEG 文件结构损坏');
    const start=offset;
    while (buffer[offset]===0xff) offset++;
    const marker=buffer[offset++];
    if (marker===0xda || marker===0xd9) { chunks.push(buffer.subarray(start)); break; }
    if (marker===0x01 || (marker>=0xd0 && marker<=0xd7)) { chunks.push(buffer.subarray(start,offset)); continue; }
    if (offset+2>buffer.length) throw new Error('JPEG 文件结构损坏');
    const size=buffer.readUInt16BE(offset);
    if(size<2 || offset+size>buffer.length) throw new Error('JPEG 文件结构损坏');
    if (marker!==0xfe && marker!==0xed) chunks.push(buffer.subarray(start,offset+size));
    offset += size;
  }
  return Buffer.concat(chunks);
}

async function lossless(source, meta) {
  let buffer=source;
  if(meta.format==='jpeg') buffer=stripJpegMetadata(source);
  else if(['png','webp'].includes(meta.format)) {
    if(meta.depth==='uchar') {
      const pipeline=sharp(source,INPUT_OPTIONS).keepMetadata();
      const candidate=await (meta.format==='png' ? pipeline.png({compressionLevel:9,adaptiveFiltering:true,palette:false}) : pipeline.webp({lossless:true,effort:6})).toBuffer();
      const original=await sharp(source,INPUT_OPTIONS).raw().toBuffer({resolveWithObject:true});
      const decoded=await sharp(candidate,INPUT_OPTIONS).raw().toBuffer({resolveWithObject:true});
      if(JSON.stringify(original.info)===JSON.stringify(decoded.info) && original.data.equals(decoded.data) && candidate.length<source.length) buffer=candidate;
    }
  } else throw new Error('此格式暂不支持无损优化，请使用 JPEG、PNG 或 WebP');
  if(buffer.length>=source.length) buffer=source;
  const rotated=[5,6,7,8].includes(meta.orientation);
  return {buffer,width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,format:meta.format,quality:null,unchanged:buffer===source};
}

async function losslessWithDimensions(source,meta,settings){
  const oriented=[5,6,7,8].includes(meta.orientation)?{width:meta.height,height:meta.width}:meta;
  const size=dimensions(oriented,settings.resize||{type:'scale',percent:100});
  const resized=size.width!==oriented.width||size.height!==oriented.height;
  const requested=settings.format||'auto';
  // Legacy JPEG hints meant preserving the original format. Lossless raster
  // re-encoding after a resize uses PNG or WebP, never a lossy JPEG encode.
  const auto=['auto','original','jpeg'].includes(requested);
  if(!resized && auto && ['jpeg','png','webp'].includes(meta.format))return lossless(source,meta);
  if(meta.depth!=='uchar')throw new Error('高位深图片暂不支持尺寸或格式转换');
  const format=auto?(meta.format==='webp'?'webp':'png'):requested;
  if(!['png','webp'].includes(format))throw new Error('无损输出支持 PNG 和 WebP');
  const pipeline=sharp(source,INPUT_OPTIONS).rotate().resize(size.width,size.height,{fit:'fill'}).keepMetadata();
  const buffer=await (format==='webp'?pipeline.webp({lossless:true,effort:6}):pipeline.png({palette:false,compressionLevel:9,adaptiveFiltering:true})).toBuffer();
  const outputMeta=await sharp(buffer,INPUT_OPTIONS).metadata();
  if([5,6,7,8].includes(outputMeta.orientation))throw new Error('输出方向信息未正确归一化');
  return {buffer,...size,format,quality:null,unchanged:false,resized};
}

// The entered size is a hard ceiling. Keep fitting originals; after a resize or
// format conversion, use the available budget for the highest fitting quality.
async function smartSize(source,meta,settings,target){
  const requested=settings.format||'auto';
  if(!['auto','jpeg','png'].includes(requested))throw new Error('输出格式支持 JPG 和 PNG');
  const limit=target;
  const oriented=[5,6,7,8].includes(meta.orientation)?{width:meta.height,height:meta.width}:meta;
  const size=dimensions(oriented,settings.resize||{type:'scale',percent:100});
  const resized=size.width!==oriented.width||size.height!==oriented.height;
  const finish=result=>{
    const imageBytes=result.buffer.length;
    if(imageBytes>limit)throw new Error('输出体积超过设置大小，请缩小分辨率');
    return {...result,imageBytes,paddedBytes:0,limitBytes:limit};
  };
  if(!resized && ['jpeg','png'].includes(meta.format) && (requested==='auto'||requested===meta.format)){
    // No padding or unnecessary encoding for a fitting, unmodified source.
    if(source.length<=limit)return finish({buffer:source,...size,format:meta.format,quality:null,unchanged:true,lossless:true});
    // JPEG marker removal is cheap and can avoid raster re-encoding entirely.
    // Oversized PNGs get their one full-color attempt below, not twice.
    if(meta.format==='jpeg'){
      const candidate=await lossless(source,meta);
      if(candidate.buffer.length<=limit)return finish({...candidate,lossless:true});
    }
  }
  if(meta.depth!=='uchar')throw new Error('高位深图片暂不支持尺寸或格式转换');
  let format=requested==='auto'?(meta.hasAlpha||meta.format==='png'?'png':'jpeg'):requested;
  const base=sharp(source,INPUT_OPTIONS).rotate().resize(size.width,size.height,{fit:'fill'}).toColourspace('srgb');
  let pngKey;
  if(format==='png'){
    pngKey=`${createHash('sha256').update(source).digest('hex')}:${size.width}x${size.height}`;
    const fullKey=pngKey+':full';
    const buffer=encodedPngs.get(fullKey)||encodedPngs.set(fullKey,await base.clone().png({compressionLevel:9,adaptiveFiltering:true,palette:false}).toBuffer());
    if(buffer.length<=limit)return finish({buffer,...size,format,quality:null,unchanged:false,lossless:true});
    if(requested==='auto' && !meta.hasAlpha)format='jpeg';
    const best=format==='png'&&encodedPngs.get(pngKey+':palette:100');
    if(best&&best.length<=limit)return finish({buffer:best,...size,format,quality:100,unchanged:false,lossless:false});
  }
  // Decode and resample once, rather than on each quality-search iteration.
  const {data,info}=await (format==='jpeg'?base.clone().flatten({background:'#fff'}):base).raw().toBuffer({resolveWithObject:true});
  const encode=async quality=>{
    const cacheKey=pngKey+':palette:'+quality;
    const cached=format==='png'&&encodedPngs.get(cacheKey);
    if(cached)return cached;
    const pipeline=sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}});
    if(format==='jpeg')return pipeline.jpeg({quality,mozjpeg:true}).toBuffer();
    return encodedPngs.set(cacheKey,await pipeline.png({palette:true,colours:Math.max(2,Math.round(2+quality*2.54)),quality,compressionLevel:9,dither:0}).toBuffer());
  };
  let quality=100,buffer=await encode(quality);
  if(buffer.length>limit){
    let low=1,high=99,best=await encode(1),bestQuality=1;
    if(best.length>limit)throw new Error('当前尺寸无法达到此体积，请缩小分辨率');
    while(low<=high){
      const q=Math.floor((low+high)/2),candidate=await encode(q);
      if(candidate.length<=limit){best=candidate;bestQuality=q;low=q+1;}else high=q-1;
    }
    buffer=best;quality=bestQuality;
  }
  return finish({buffer,...size,format,quality,unchanged:false,lossless:false});
}

export async function processImage(source, settings) {
  if (!Buffer.isBuffer(source) || source.length>100*1024*1024) throw new Error('单张图片须小于 100 MB');
  const meta=await sharp(source,INPUT_OPTIONS).metadata();
  if(!SUPPORTED.includes(meta.format)) throw new Error('不支持此图片格式');
  if(meta.pages>1) throw new Error('暂不支持动画或多页图片，以免丢失帧');
  const target=Number(settings.targetBytes);
  const hasTarget=['target','smart'].includes(settings.mode)||settings.targetBytes!==undefined;
  if(hasTarget && (!Number.isInteger(target) || target<64 || target>100*1024*1024)) throw new Error('目标大小须介于 64 字节与 100 MB 之间');
  if(settings.mode==='smart')return smartSize(source,meta,settings,target);
  const finish=result=>{
    const imageBytes=result.buffer.length;
    if(hasTarget && imageBytes>target)throw new Error(`无法无损达到此大小（优化后 ${(imageBytes/1024/1024).toFixed(3)} MB）。请增加大小或缩小尺寸。`);
    if(settings.exact && hasTarget)result.buffer=padToExactSize(result.buffer,target,result.format);
    return {...result,imageBytes,paddedBytes:result.buffer.length-imageBytes};
  };
  if(settings.mode==='lossless') return finish(await losslessWithDimensions(source,meta,settings));
  if(settings.mode!=='target') throw new Error('压缩模式无效');
  const format=settings.format;
  if(!['jpeg','png','webp'].includes(format)) throw new Error('输出格式无效');
  const rotated=[5,6,7,8].includes(meta.orientation) ? {width:meta.height,height:meta.width} : meta;
  const size=dimensions(rotated,settings.resize);
  const base=sharp(source,INPUT_OPTIONS).rotate().resize(size.width,size.height,{fit:'fill'}).toColourspace('srgb');
  if(format==='jpeg') base.flatten({background:'#ffffff'});
  const encode=async quality => {
    const p=base.clone();
    if(format==='jpeg') return p.jpeg({quality,mozjpeg:true}).toBuffer();
    if(format==='webp') return p.webp({quality,effort:4}).toBuffer();
    if(quality===100)return p.png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    return p.png({palette:true,colours:Math.min(256,Math.max(2,Math.round(2+quality*2.54))),quality,compressionLevel:9,dither:0}).toBuffer();
  };
  let quality=100, buffer=await encode(quality);
  if(buffer.length>target) {
    let low=1,high=99,best=await encode(1),bestQuality=1;
    if(best.length>target) throw new Error('当前尺寸无法达到目标大小，请缩小分辨率或提高大小上限');
    while(low<=high) {
      const q=Math.floor((low+high)/2),candidate=await encode(q);
      if(candidate.length<=target) {best=candidate;bestQuality=q;low=q+1;} else high=q-1;
    }
    buffer=best;quality=bestQuality;
  }
  return finish({buffer,...size,format,quality,unchanged:false});
}
