import {arrangeImages} from './canvas-fixed.mjs';
import {validateCanvas} from './canvas-limits.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {optimizationSettings} from './optimization-settings.mjs';
function targetRatio(project){if(project.canvasMode!=='fixed')return 2.5;const canvas=validateCanvas(project.canvas.width,project.canvas.height);return canvas.width/canvas.height;}
// Work from immutable original dimensions, never from already cropped previews.
export function optimizationAvailability(project){
 if(!project?.images?.length)return {enabled:false,hint:'请先添加图片'};
 if(project.layout!=='horizontal')return {enabled:false,hint:'仅横排可用'};
 let edits,settings;try{settings=optimizationSettings(project.optimization);edits=optimizationEdits(project.images,targetRatio(project),settings);}catch(error){return {enabled:false,hint:error.message};}
 if(project.images.every(image=>sameCrop(image,project.edits?.[image.id],edits[image.id])))return {enabled:false,hint:'当前裁剪已优化'};
 return {enabled:true,hint:project.images.length>=3?`第三张顶部裁 ${settings.topPercent}%、左右各裁 ${settings.sidePixels} px，其余左右裁剪铺满画布`:'按原图统一左右裁剪并铺满画布'};
}
function sameCrop(image,a,b){const left=imageGeometry(image,a),right=imageGeometry(image,b);return ['left','top','width','height'].every(key=>Math.abs(left[key]-right[key])<1e-9);}

export function optimizationEdits(images,target=2.5,options){
 const {topPercent,sidePixels}=optimizationSettings(options);
 if(images?.length>100||images?.some(image=>![image.width,image.height].every(value=>Number.isInteger(value)&&value>0)))throw new Error('图片尺寸无效');
 if(!images?.length||images.length<3)return proportionalHorizontalEdits(images,target);
 const third=images[2],top=Math.round(third.height*topPercent/100);
 if(sidePixels>Math.floor((third.width-1)/2)||third.height-top<1)throw new Error('第三张裁剪后不足 1 像素，请减小顶部或左右裁剪');
 const fixed={edges:{left:sidePixels,right:sidePixels,top,bottom:0},links:{horizontal:true,vertical:false}};
 const remaining=images.filter((_,index)=>index!==2),ratio=(third.width-2*sidePixels)/(third.height-top),rest=target-ratio;
 if(rest<=0)throw new Error('第三张裁剪后过宽，无法铺满当前画布，请调整画布或图片');
 const edits=proportionalHorizontalEdits(remaining,rest);
 return Object.fromEntries(images.map((image,index)=>[image.id,index===2?fixed:edits[image.id]]));
}
export function proportionalHorizontalEdits(images,target=2.5){
 if(!images?.length)throw new Error('请添加图片');
 if(images.length>100||images.some(image=>![image.width,image.height].every(value=>Number.isInteger(value)&&value>0)))throw new Error('图片尺寸无效');
 const ratio=images.reduce((sum,image)=>sum+image.width/image.height,0);
 if(!Number.isFinite(target)||target<=0||ratio<target)throw new Error(`原图横排比例不足 ${target}，无法靠左右裁剪铺满画布`);
 const fraction=(1-target/ratio)/2;
 if(images.some(image=>image.width*(1-2*fraction)<1))throw new Error('裁剪后不足 1 原图像素，请调整图片');
 return Object.fromEntries(images.map(image=>[image.id,{axis:'horizontal',fraction}]));
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
  const same=project.images.every(image=>{const p=project.positions[image.id],q=next.positions[image.id];return sameCrop(image,project.edits?.[image.id],edits[image.id])&&['x','y','width','height'].every(key=>Math.abs(p[key]-q[key])<1e-9);});
  return same?project:next;
 }
 return {...project,optimization:settings,edits,export:{...project.export,longEdge}};
}
