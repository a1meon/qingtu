import {AlphaAction,ColorSpace,FilterType,ImageMagick,MagickColors,MagickFormat,MagickGeometry,MagickImageCollection,MagickReadSettings} from '@imagemagick/magick-wasm';
import {prepareBoundedPixels,pixelDifference} from '../../engine/pixel-difference.mjs';
import {dimensions,pngBudgetDimensions} from '../../engine/image-dimensions.mjs';

const animationError='暂不支持动画或多页图片，以免丢失帧';
const ascii=(bytes,offset,length)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
function inputFormat(bytes){
  if(bytes[0]===0xff&&bytes[1]===0xd8)return 'jpeg';
  if(bytes[0]===137&&ascii(bytes,1,3)==='PNG'){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let offset=8;offset+12<=bytes.length;){
      const type=ascii(bytes,offset+4,4);
      if(type==='acTL')throw new Error(animationError);
      if(type==='IDAT')break;
      offset+=12+view.getUint32(offset);
    }
    return 'png';
  }
  if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'){
    if(ascii(bytes,12,4)==='VP8X'&&(bytes[20]&2))throw new Error(animationError);
    return 'webp';
  }
  const tiff=ascii(bytes,0,4);
  if(['II*\0','MM\0*','II+\0','MM\0+'].includes(tiff))return 'tiff';
  if(ascii(bytes,4,4)==='ftyp'){
    const end=Math.min(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0),bytes.length);
    const brands=[];for(let i=8;i+4<=Math.min(end,1024);i+=4)if(i!==12)brands.push(ascii(bytes,i,4));
    if(brands.includes('avis'))throw new Error(animationError);
    if(brands.includes('avif'))return 'avif';
  }
  throw new Error('支持 JPEG、PNG、WebP、AVIF 和 TIFF 图片');
}
export async function inspect(file){
  if(!(file instanceof Blob)||file.size>100*1024*1024)throw new Error('单张图片须小于 100 MB');
  const bytes=new Uint8Array(await file.arrayBuffer()),format=inputFormat(bytes);
  const frames=MagickImageCollection.create();
  try{
    frames.ping(bytes,new MagickReadSettings({frameCount:2}));
    if(frames.length!==1)throw new Error(animationError);
    const image=frames[0];
    if(!image.width||!image.height||image.width*image.height>100_000_000)throw new Error('总像素须小于等于 1 亿');
    const rotated=[5,6,7,8].includes(image.orientation);
    return {bytes,meta:{format,width:rotated?image.height:image.width,height:rotated?image.width:image.height,depth:image.depth}};
  }finally{frames.dispose();}
}
export function oriented(bytes,callback){
  return ImageMagick.read(bytes,image=>{image.autoOrient();image.colorSpace=ColorSpace.sRGB;image.strip();return callback(image);});
}
function resize(image,{width,height}){
  if(width===image.width&&height===image.height)return;
  const geometry=new MagickGeometry(width,height);geometry.ignoreAspectRatio=true;
  image.resize(geometry,FilterType.Lanczos);
}
function write(image,format){
  const coder=format==='jpeg'?MagickFormat.Jpeg:image.hasAlpha?MagickFormat.Png32:MagickFormat.Png24;
  return image.write(coder,bytes=>new Blob([bytes],{type:`image/${format}`}));
}
export function preview(bytes){
  return oriented(bytes,image=>{
    const scale=Math.min(1,1600/image.width,1200/image.height);
    resize(image,{width:Math.max(1,Math.round(image.width*scale)),height:Math.max(1,Math.round(image.height*scale))});
    return {preview:write(image,'png'),previewWidth:image.width,previewHeight:image.height};
  });
}
function boundedPng(image,target){
  const {width,height}=image,channels=image.hasAlpha?4:3;
  const data=image.getPixels(p=>p.toByteArray(0,0,width,height,channels===4?'RGBA':'RGB'));
  const pixels=prepareBoundedPixels(data,{width,height,channels});
  const settings=new MagickReadSettings({width,height,depth:8,format:channels===4?MagickFormat.Rgba:MagickFormat.Rgb});
  // Always compare to the unmodified output-size raster. Quantisation never touches alpha.
  function attempt(strength){
    const candidate=pixels(strength);
    const difference=pixelDifference(data,candidate,channels);if(difference.rmse>1.5)return null;
    const blob=ImageMagick.read(candidate,settings,copy=>{copy.strip();return write(copy,'png');});
    return blob.size<=target?{blob,width,height,lossless:false,difference}:null;
  }
  let best=attempt(100);
  if(best){let low=0,high=100;for(let probe=0;probe<4;probe++){
    const strength=Math.floor((low+high)/2),result=attempt(strength);
    if(result){high=strength;best=result;}else low=strength;
  }}
  return best;
}
function fitPng(image,target,maxRatio){
  const full=write(image,'png'),size={width:image.width,height:image.height};
  if(full.size<=target)return {blob:full,...size};
  const bounded=boundedPng(image,target);if(bounded)return bounded;
  const long=Math.max(size.width,size.height),unit=size.width*2===size.height*5||size.height*2===size.width*5?5:1;
  let low=0,high=long,best,estimate=long*Math.sqrt(target/full.size)*.98;
  for(let n=0;high-low>unit;n++){
    let edge=Math.floor(estimate/unit)*unit;
    if(edge<=low||edge>=high)edge=Math.max(unit,Math.floor((low+high)/2/unit)*unit);
    const candidate=pngBudgetDimensions(size,edge,{maxRatio});
    const blob=image.clone(copy=>{resize(copy,candidate);return write(copy,'png');});
    if(blob.size<=target){best={blob,...candidate};low=edge;}else high=edge;
    if(best&&(n>=4||best.blob.size>=.985*target))break;
    estimate=edge*Math.sqrt(target/blob.size)*.99;
  }
  if(!best)throw new Error('此字节上限小于有效 PNG 文件所需体积，请提高大小上限');
  return best;
}
function fitJpeg(image,target){
  image.backgroundColor=MagickColors.White;image.alpha(AlphaAction.Remove);
  const attempt=quality=>{image.quality=quality;return {blob:write(image,'jpeg'),quality};};
  let best=attempt(100);
  if(best.blob.size>target){
    best=attempt(1);if(best.blob.size>target)throw new Error('当前尺寸无法达到此体积，请增加大小上限或缩小尺寸');
    let low=2,high=99;
    while(low<=high){const q=Math.floor((low+high)/2),candidate=attempt(q);if(candidate.blob.size<=target){best=candidate;low=q+1;}else high=q-1;}
  }
  return {...best,width:image.width,height:image.height};
}
export async function encode(file,meta,settings,{maxRatio}={}){
  const limitBytes=Number(settings.targetBytes),format=settings.format;
  if(!Number.isInteger(limitBytes)||limitBytes<64||limitBytes>100000000)throw new Error('大小须为 64 字节–100 MB');
  if(!['jpeg','png'].includes(format))throw new Error('输出格式支持 JPG 和 PNG');
  const size=dimensions(meta,settings.resize),unchanged=format===meta.format&&file.size<=limitBytes&&size.width===meta.width&&size.height===meta.height;
  if(!unchanged&&meta.depth>8)throw new Error('高位深图片暂不支持尺寸或格式转换');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const output=unchanged?{blob:file,...size}:oriented(bytes,image=>{resize(image,size);return format==='png'?fitPng(image,limitBytes,maxRatio):fitJpeg(image,limitBytes);});
  return {...output,...preview(unchanged?bytes:new Uint8Array(await output.blob.arrayBuffer())),bytes:output.blob.size,imageBytes:output.blob.size,paddedBytes:0,format,limitBytes,unchanged,lossless:output.lossless??(unchanged||format==='png'),encoding:format==='jpeg'?'JPG':output.lossless===false?'全彩高保真 PNG':'全彩无损 PNG',requestedWidth:size.width,requestedHeight:size.height,autoResized:output.width!==size.width||output.height!==size.height,scalePercent:100*Math.min(output.width/size.width,output.height/size.height)};
}
