import {arrangeImages} from './canvas-fixed.mjs';
import {validateCanvas} from './canvas-limits.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {optimizationSettings,optimizationImageCrops} from './optimization-settings.mjs';
function targetRatio(project){if(project.canvasMode!=='fixed')return 2.5;const canvas=validateCanvas(project.canvas.width,project.canvas.height);return canvas.width/canvas.height;}
// Work from immutable original dimensions, never from already cropped previews.
export function optimizationAvailability(project){
 if(!project?.images?.length)return {enabled:false,hint:'请先添加图片'};
 if(project.layout!=='horizontal')return {enabled:false,hint:'仅横排可用'};
 let next,settings;try{settings=optimizationSettings(project.optimization);const edits=optimizationEdits(project.images,targetRatio(project),settings);next=project.canvasMode==='fixed'?arrangeImages({...project,edits},'horizontal'):{edits};}catch(error){return {enabled:false,hint:error.message};}
 if(sameOptimization(project,next))return {enabled:false,hint:'当前裁剪已优化'};
 const crops=optimizationImageCrops(settings,project.images),selected=project.images.filter(image=>crops[image.id]?.enabled);
 return {enabled:true,hint:selected.length?`为 ${selected.length} 张图片应用特殊裁剪，其余自动裁剪铺满画布`:'按原图自动裁剪并铺满画布'};
}
function sameCrop(image,a,b){const left=imageGeometry(image,a),right=imageGeometry(image,b);return ['left','top','width','height'].every(key=>Math.abs(left[key]-right[key])<1e-9);}
// Availability and execution must agree: matching crops alone do not mean
// a resized, stretched or moved picture still fills its intended rectangle.
function sameOptimization(project,next){
 return project.images.every(image=>sameCrop(image,project.edits?.[image.id],next.edits[image.id])&&(project.canvasMode!=='fixed'||['x','y','width','height'].every(key=>Math.abs(project.positions?.[image.id]?.[key]-next.positions[image.id][key])<1e-9)));
}

export function optimizationEdits(images,target=2.5,options){
 if(images?.length>100||images?.some(image=>![image.width,image.height].every(value=>Number.isInteger(value)&&value>0)))throw new Error('图片尺寸无效');
 const crops=optimizationImageCrops(options,images||[]),selected=images?.filter(image=>crops[image.id]?.enabled)||[];
 if(!selected.length)return proportionalHorizontalEdits(images,target);
 const fixed={};let ratio=0;
 for(const image of selected){
  const {topPercent,sidePixels}=crops[image.id],top=Math.round(image.height*topPercent/100),number=images.indexOf(image)+1;
  if(sidePixels>Math.floor((image.width-1)/2)||image.height-top<1)throw new Error(`第${number}张裁剪后不足 1 像素，请减小顶部或左右裁剪`);
  fixed[image.id]={edges:{left:sidePixels,right:sidePixels,top,bottom:0},links:{horizontal:true,vertical:false}};ratio+=(image.width-2*sidePixels)/(image.height-top);
 }
 const remaining=images.filter(image=>!crops[image.id]?.enabled),rest=target-ratio;
 if(!remaining.length){if(Math.abs(rest)<1e-9)return fixed;throw new Error('所选图片裁剪后无法匹配画布，请调整裁剪参数或取消部分选择');}
 if(rest<=0)throw new Error('所选图片裁剪后过宽，无法铺满当前画布，请调整裁剪参数或画布');
 const edits=proportionalHorizontalEdits(remaining,rest);
 return Object.fromEntries(images.map(image=>[image.id,Object.hasOwn(fixed,image.id)?fixed[image.id]:edits[image.id]]));
}
export function proportionalHorizontalEdits(images,target=2.5){
 if(!images?.length)throw new Error('请添加图片');
 if(images.length>100||images.some(image=>![image.width,image.height].every(value=>Number.isInteger(value)&&value>0)))throw new Error('图片尺寸无效');
 const ratio=images.reduce((sum,image)=>sum+image.width/image.height,0);
 if(!Number.isFinite(target)||target<=0)throw new Error('画布比例无效');
 // Width-only cropping cannot fill a wider canvas. Crop the other axis
 // instead, retaining equal scale and the user's exact special-image cuts.
 const axis=ratio<target?'vertical':'horizontal',fraction=(1-Math.min(ratio/target,target/ratio))/2;
 if(images.some(image=>image[axis==='horizontal'?'width':'height']*(1-2*fraction)<1))throw new Error('裁剪后不足 1 原图像素，请调整图片或画布');
 return Object.fromEntries(images.map(image=>[image.id,{axis,fraction}]));
}

export function optimizeHorizontal(project){
 if(project.layout!=='horizontal')throw new Error('请切换横排后优化');
 const settings=optimizationSettings(project.optimization),edits=optimizationEdits(project.images,targetRatio(project),settings);
 const requested=Number(project.export?.longEdge??5999);
 if(project.canvasMode!=='fixed'&&(!Number.isInteger(requested)||requested<5||requested>5999))throw new Error('严格 2.5:1 的长边须为 5–5999 px');
 const longEdge=Math.floor(requested/5)*5;
 if(project.canvasMode!=='fixed'&&project.export?.longEdge===longEdge&&Object.keys(project.edits||{}).length===project.images.length&&project.images.every(image=>{
  return sameCrop(image,project.edits?.[image.id],edits[image.id]);
 }))return project;
 if(project.canvasMode==='fixed'){
  const next=arrangeImages({...project,optimization:settings,edits},'horizontal');
  return sameOptimization(project,next)?project:next;
 }
 return {...project,optimization:settings,edits,export:{...project.export,longEdge}};
}
