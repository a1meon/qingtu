// The desktop and WebAssembly backends share the same engine algorithms.
// Keep this adapter deliberately limited to the operations used by engine/.
import Vips from 'wasm-vips';
import {Buffer} from 'buffer';
let runtime;
export const vipsRuntime=()=>runtime??=Vips(globalThis.__qingtuVipsOptions||{}).then(v=>{v.Cache.max(0);v.concurrency(2);return v;});
const rgba=value=>{if(value==='#fff'||value==='#ffffff')return [255,255,255];if(value==='#00000000')return [0,0,0,0];throw new Error('Unsupported background '+value);};
class Pipeline {
 constructor(input,options={},ops=[]){this.input=input;this.options=options;this.ops=ops;}
 clone(){return new Pipeline(this.input,this.options,[...this.ops]);}
 op(name,...args){this.ops.push([name,args]);return this;}
 rotate(...a){return this.op('rotate',...a);} resize(...a){return this.op('resize',...a);}
 extract(...a){return this.op('extract',...a);} ensureAlpha(){return this.op('alpha');}
 flatten(...a){return this.op('flatten',...a);} toColourspace(...a){return this.op('colour',...a);}
 composite(...a){return this.op('composite',...a);} keepMetadata(){return this.op('keep');}
 raw(){return this.op('output','raw',{});} png(o={}){return this.op('output','png',o);}
 jpeg(o={}){return this.op('output','jpeg',o);} webp(o={}){return this.op('output','webp',o);}
 async run(metadata=false,resolve=false){
  const v=await vipsRuntime(),owned=[];const own=x=>(owned.push(x),x);
  const load=(input,opts={})=>{const r=opts.raw;return own(r?own(v.Image.newFromMemory(input,r.width,r.height,r.channels,'uchar')).copy({interpretation:r.channels<3?'b-w':'srgb'}):v.Image.newFromBuffer(input,'',{fail_on:'error'}));};
  try{
   let im=load(this.input,this.options),output='raw',settings={},keep=false;
   if(im.width*im.height>(this.options.limitInputPixels||100000000))throw new Error('图片像素超过上限');
   if(metadata){
    const get=(key,type='getInt')=>im.getTypeof(key)?im[type](key):undefined;
    const loader=get('vips-loader','getString')||'';
    const format=['jpeg','png','webp','heif','tiff','gif'].find(n=>loader.includes(n));
    return {width:im.width,height:im.height,channels:im.bands,depth:String(im.format),format:format==='heif'?'heif':format,orientation:get('orientation'),pages:get('n-pages'),hasAlpha:im.hasAlpha()};
   }
   // Sharp normalizes embedded profiles before processing unless keepMetadata
   // explicitly requests the original colour encoding.
   if(!this.ops.some(([name])=>name==='keep')){
    if(im.getTypeof('icc-profile-data')){try{im=own(im.iccTransform('srgb',{embedded:true,intent:'perceptual',depth:8}));}catch{/* Match Sharp's invalid-profile fallback. */}}
    else if(im.interpretation==='cmyk')im=own(im.iccTransform('srgb',{input_profile:'cmyk',intent:'perceptual'}));
   }
   for(const [name,args]of this.ops){
    if(name==='keep'){keep=true;continue;}
    if(name==='output'){[output,settings]=args;continue;}
    if(name==='rotate'){
     if(args.length===0)im=own(im.autorot());
     else {const angle=((args[0]%360)+360)%360;if(angle%90===0){if(angle)im=own(im.rot('d'+angle));}
      else im=own(im.rotate(angle,{background:rgba(args[1]?.background||'#00000000')}));}
    }else if(name==='resize'){
     const o=typeof args[0]==='object'?args[0]:{...args[2],width:args[0],height:args[1]};
     let sx=o.width?o.width/im.width:undefined,sy=o.height?o.height/im.height:undefined;
     if(o.fit==='fill'&&sx&&sy){}else {sx=sy=Math.min(sx??Infinity,sy??Infinity);}
     sx??=sy;sy??=sx;if(o.withoutEnlargement){sx=Math.min(1,sx);sy=Math.min(1,sy);}
     if(sx!==1||sy!==1){const alpha=im.hasAlpha();if(alpha)im=own(own(im.premultiply()).cast('uchar'));im=own(im.resize(sx,{vscale:sy,kernel:o.kernel==='linear'?'linear':'lanczos3'}));if(alpha)im=own(own(im.unpremultiply()).cast('uchar'));}
    }else if(name==='extract'){const {left,top,width,height}=args[0];im=own(im.extractArea(left,top,width,height));}
    else if(name==='alpha'){if(!im.hasAlpha())im=own(im.bandjoin(255));}
    else if(name==='flatten'){if(im.hasAlpha())im=own(im.flatten({background:im.bands<3?[255]:rgba(args[0]?.background||'#fff')}));}
    else if(name==='colour')im=own(im.colourspace(args[0]));
    else if(name==='composite')for(const item of args[0])im=own(im.composite2(load(item.input,item),'over',{x:item.left,y:item.top,compositing_space:'srgb'}));
    else throw new Error('Unsupported operation '+name);
   }
   if(im.format!=='uchar')im=own(im.cast('uchar'));
   const info={format:output,width:im.width,height:im.height,channels:im.bands,depth:'uchar',premultiplied:false};
   let data;
   if(output==='raw')data=Buffer.from(im.writeToMemory());
   else {
    const opts={keep:keep?'all':'none'};
    if(output==='png')Object.assign(opts,{compression:settings.compressionLevel??6,filter:settings.adaptiveFiltering?'all':'none',palette:false});
    else if(output==='jpeg')Object.assign(opts,{Q:settings.quality??80,subsample_mode:settings.chromaSubsampling==='4:4:4'?'off':'on',optimize_coding:settings.optimiseCoding??true,...(settings.mozjpeg?{trellis_quant:true,overshoot_deringing:true,optimize_scans:true,interlace:true,quant_table:3}: {})});
    else if(output==='webp')Object.assign(opts,{Q:settings.quality??80,lossless:settings.lossless??false,effort:settings.effort??4});
    data=Buffer.from(im.writeToBuffer('.'+(output==='jpeg'?'jpg':output),opts));
   }
   info.size=data.length;return resolve?{data,info}:data;
  }finally{for(const im of owned.reverse())im.delete();}
 }
 metadata(){return this.run(true);} toBuffer(options={}){return this.run(false,options.resolveWithObject);}
}
export default function sharp(input,options){return new Pipeline(input,options);}
sharp.prototype=Pipeline.prototype;
sharp.cache=()=>{};sharp.concurrency=()=>{};
