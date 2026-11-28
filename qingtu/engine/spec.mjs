// Reference-asset specifications shared by the renderer, the Node engine and
// the browser codec. Pure module: no Node or browser APIs.
import {MAX_EDGE,MAX_RATIO} from './canvas-limits.mjs';
import {dimensions} from './image-dimensions.mjs';

export const MB=1_000_000;
const RATIO_MIN=1/MAX_RATIO;

// Seedance 2.5 image rule (third-party summary of the Dreamina user guide):
// sides 300–6000 px, 0.4 < ratio < 2.5 (both exclusive), < 30 MB, ≤ 30 per request; the API also
// caps a request body at 64 MB. The app already limits every export to a
// 5999 px long edge, so that shared cap is used for the maximum side.
const base={minSide:300,maxSide:MAX_EDGE,ratioMin:RATIO_MIN,ratioMax:MAX_RATIO,maxCount:30,totalBytes:null,formats:['jpeg','png','webp']};
export const SPEC_PRESETS=[
 {id:'seedance',label:'Seedance 2.5',short:'模型规格',...base,maxBytes:30*MB},
 {id:'seedance-api',label:'火山方舟 API',short:'请求合计 ≤ 64 MB',...base,maxBytes:30*MB,totalBytes:64*MB},
 {id:'safe',label:'第三方平台',short:'单张 10 MB',...base,maxBytes:10*MB},
 {id:'custom',label:'自定义',short:'自定义上限',custom:true},
 {id:'off',label:'不检查',short:'仅压缩',off:true}
];
export const CUSTOM_DEFAULT={...base,maxBytes:30*MB};
export const FIT_MODES=[
 {value:'blur',label:'模糊补边'},
 {value:'crop',label:'居中裁剪'},
 {value:'pad-black',label:'黑色补边'},
 {value:'pad-white',label:'白色补边'},
 {value:'none',label:'不修正，仅提示'}
];
// 'none' keeps the export as-is: the spec is only checked and reported.
export const fixesSpec=fit=>fit!=='none';
export const fitLabel=value=>FIT_MODES.find(mode=>mode.value===value)?.label||'';

export function resolveSpec(id,custom=CUSTOM_DEFAULT){
 const preset=SPEC_PRESETS.find(p=>p.id===id)||SPEC_PRESETS[0];
 if(preset.off)return null;
 if(preset.custom)return normalizeSpec(custom);
 return preset;
}
// Renderer values are untrusted and half-typed fields fall back to defaults.
// Reversed bounds are swapped; the long edge never exceeds the app-wide cap.
export function normalizeSpec(spec){
 const n=(k,min)=>{const v=Number(spec?.[k]);return Number.isFinite(v)&&v>=min?v:CUSTOM_DEFAULT[k];};
 let minSide=Math.round(n('minSide',1)),maxSide=Math.round(n('maxSide',1)),ratioMin=n('ratioMin',0.01),ratioMax=n('ratioMax',0.01);
 if(minSide>maxSide)[minSide,maxSide]=[maxSide,minSide];
 maxSide=Math.min(MAX_EDGE,maxSide);minSide=Math.min(minSide,maxSide);
 if(ratioMin>ratioMax)[ratioMin,ratioMax]=[ratioMax,ratioMin];
 return {...CUSTOM_DEFAULT,id:spec?.id||'custom',label:spec?.label||'自定义',minSide,maxSide,ratioMin,ratioMax,maxBytes:Math.round(n('maxBytes',1000)),maxCount:Math.round(n('maxCount',1)),totalBytes:spec?.totalBytes||null,formats:Array.isArray(spec?.formats)?spec.formats:CUSTOM_DEFAULT.formats};
}

// Ratio bounds are exclusive: 0.4 < w/h < 2.5 (exactly 2.5:1 does not pass).
export const ratioOk=(spec,w,h)=>{const r=w/h;return r>spec.ratioMin&&r<spec.ratioMax;};
const sideOk=(spec,w,h)=>Math.min(w,h)>=spec.minSide&&Math.max(w,h)<=spec.maxSide;
// Nearest integer edge that puts the ratio strictly inside the bounds.
const insideWide=(w,h,max,crop)=>crop?{w:Math.ceil(h*max)-1,h}:{w,h:Math.floor(w/max)+1};
const insideTall=(w,h,min,crop)=>crop?{w,h:Math.ceil(w/min)-1}:{w:Math.floor(h*min)+1,h};

// Final canvas for a requested output size. Crop trims the long side; padding
// extends the short side, so kept pixels are never upsampled just to change the
// ratio and nothing is ever stretched.
export function fitToSpec(spec,width,height,fit='blur'){
 if(!spec||!fixesSpec(fit))return {width,height,reframe:false,scaled:false};
 const crop=fit==='crop';
 let w=width,h=height,reframe=false;
 if(!ratioOk(spec,w,h)){
  ({w,h}=w/h>=spec.ratioMax?insideWide(w,h,spec.ratioMax,crop):insideTall(w,h,spec.ratioMin,crop));
  reframe=true;
 }
 let k=1;
 if(Math.max(w,h)>spec.maxSide)k=spec.maxSide/Math.max(w,h);
 if(Math.min(w,h)*k<spec.minSide)k=spec.minSide/Math.min(w,h);
 let fw=Math.min(spec.maxSide,Math.max(spec.minSide,Math.round(w*k))),fh=Math.min(spec.maxSide,Math.max(spec.minSide,Math.round(h*k)));
 // Rounding after scaling can land on or past a bound; step back inside.
 if(fw/fh>=spec.ratioMax)({w:fw,h:fh}=insideWide(fw,fh,spec.ratioMax,crop||fh>=spec.maxSide));
 else if(fw/fh<=spec.ratioMin)({w:fw,h:fh}=insideTall(fw,fh,spec.ratioMin,crop||fw>=spec.maxSide));
 return {width:fw,height:fh,reframe,scaled:k!==1};
}
// Output plan for an image under the current resize settings.
export function specPlan(meta,resize,spec,fit){
 const size=dimensions(meta,resize);
 return fitToSpec(spec?normalizeSpec(spec):null,size.width,size.height,fit);
}

export function checkAsset(spec,{width,height,bytes,format}){
 if(!spec)return [];
 return [
  {id:'size',label:'尺寸',ok:sideOk(spec,width,height),value:`${width}×${height}`,rule:`${spec.minSide}–${spec.maxSide} px`},
  {id:'ratio',label:'比例',ok:ratioOk(spec,width,height),value:ratioText(width/height),rule:`${trimNumber(spec.ratioMin)} < 比例 < ${trimNumber(spec.ratioMax)}`},
  {id:'bytes',label:'大小',ok:bytes<spec.maxBytes,value:formatBytes(bytes),rule:`< ${formatBytes(spec.maxBytes)}`},
  {id:'format',label:'格式',ok:spec.formats.includes(format),value:formatName(format),rule:spec.formats.map(formatName).join(' / ')}
 ];
}
export const assetOk=(spec,asset)=>checkAsset(spec,asset).every(row=>row.ok);
export const formatName=f=>f==='jpeg'?'JPG':f==='heif'?'AVIF':String(f||'').toUpperCase();
const trimNumber=v=>String(Math.round(v*100)/100);
// Three decimals, truncated, so 2.4983 reads 2.498 rather than a misleading 2.50.
const ratioText=r=>(Math.floor(r*1000)/1000).toFixed(3);
// Truncate rather than round up, so a file just under a limit never displays as
// the limit itself (9,996,000 bytes shows 9.99 MB, not 10 MB).
export function formatBytes(b){
 if(b<1000)return `${b} B`;
 const [v,u]=b<MB?[b/1000,'KB']:[b/MB,'MB'];
 const d=v>=100?0:v>=10?1:2,p=10**d;
 return `${Math.floor(v*p)/p} ${u}`;
}
