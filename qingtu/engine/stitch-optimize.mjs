import {arrangeImages} from './canvas-fixed.mjs';
import {FOUR_VIEW_RATIO,MAX_EDGE,canvasRatioLimit,validateCanvas} from './canvas-limits.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {optimizationSettings,optimizationImageCrops} from './optimization-settings.mjs';

function sameCrop(image,a,b){
 const left=imageGeometry(image,a),right=imageGeometry(image,b);
 return ['left','top','width','height'].every(key=>Math.abs(left[key]-right[key])<1e-9);
}
function sameOptimization(project,next){
 if(project.canvasMode==='fixed'&&(project.canvas.width!==next.canvas.width||project.canvas.height!==next.canvas.height))return false;
 if(project.canvasMode!=='fixed'&&project.export?.longEdge!==next.export?.longEdge)return false;
 return project.images.every(image=>sameCrop(image,project.edits?.[image.id],next.edits[image.id])&&(project.canvasMode!=='fixed'||['x','y','width','height'].every(key=>Math.abs(project.positions?.[image.id]?.[key]-next.positions[image.id][key])<1e-9)));
}

function validateInputs(images,target){
 if(!images?.length)throw new Error('请添加图片');
 if(images.length>100||images.some(image=>![image.width,image.height].every(v=>Number.isInteger(v)&&v>0)))throw new Error('图片尺寸无效');
 if(!Number.isFinite(target)||target<=0)throw new Error('画布比例无效');
}

export function proportionalHorizontalEdits(images,target=FOUR_VIEW_RATIO){
 validateInputs(images,target);
 const ratio=images.reduce((sum,image)=>sum+image.width/image.height,0);
 const fraction=ratio<=target+1e-12?0:(1-target/ratio)/2;
 if(images.some(image=>image.width*(1-2*fraction)<1))throw new Error('裁剪后不足 1 原图像素，请调整图片或特殊裁剪设置');
 return Object.fromEntries(images.map(image=>[image.id,{axis:'horizontal',fraction}]));
}

// Reserve the selected crops first. The remaining width budget is an upper
// bound: a narrower row never needs to lose pixels just to fill a wider frame.
export function optimizationEdits(images,target=FOUR_VIEW_RATIO,options){
 validateInputs(images,target);
 const limit=Math.min(target,FOUR_VIEW_RATIO);
 const crops=optimizationImageCrops(options,images),edits=new Map(),ordinary=[];
 let reserved=0;
 for(const [index,image] of images.entries()){
  const crop=crops[image.id];
  if(!crop?.enabled){ordinary.push(image);continue;}
  const top=Math.round(image.height*crop.topPercent/100),side=crop.sidePixels;
  if(image.width-2*side<1||image.height-top<1)throw new Error(`第${index+1}张裁剪后不足 1 像素，请减小顶部或左右裁剪`);
  const edit={edges:{left:side,right:side,top,bottom:0},links:{horizontal:true,vertical:false}};
  const geometry=imageGeometry(image,edit);reserved+=geometry.width/geometry.height;edits.set(image.id,edit);
 }
 const budget=limit-reserved;
 if(budget < -1e-12||ordinary.length&&budget<=0)throw new Error('特殊裁剪图片已占满比例上限，请调整参数或减少选中的图片');
 const shared=ordinary.length?proportionalHorizontalEdits(ordinary,budget):{};
 return Object.fromEntries(images.map(image=>[image.id,edits.get(image.id)??shared[image.id]]));
}

export function optimizeHorizontal(project){
 if(project.layout!=='horizontal')throw new Error('请切换横排后优化');
 const settings=optimizationSettings(project.optimization),edits=optimizationEdits(project.images,FOUR_VIEW_RATIO,settings);
 const ratio=project.images.reduce((sum,image)=>{const source=imageGeometry(image,edits[image.id]);return sum+source.width/source.height;},0);
 let next={...project,optimization:settings,edits};
 if(project.canvasMode==='fixed'){
  const {width,height}=validateCanvas(project.canvas.width,project.canvas.height,project.sourceCanvas);
  const maxWidth=Math.max(1,Math.floor(height*FOUR_VIEW_RATIO));
  const fittedWidth=project.canvasSizing==='content'
   ?Math.max(Math.ceil(height/canvasRatioLimit(project.sourceCanvas)),Math.round(height*ratio)):width;
  const newWidth=Math.min(MAX_EDGE,maxWidth,fittedWidth);
  if(newWidth!==width)next.canvas={width:newWidth,height};
  const longEdge=Math.max(newWidth,height);
  if(project.export?.longEdge!==longEdge)next.export={...project.export,longEdge};
  next=arrangeImages(next,'horizontal');
 }else{
  const requested=project.export?.longEdge??MAX_EDGE;
  if(!Number.isInteger(requested)||requested<1||requested>MAX_EDGE)throw new Error('长边须为 1–5999 px');
  if(Math.abs(ratio-FOUR_VIEW_RATIO)<1e-12&&requested>=12)next.export={...project.export,longEdge:Math.floor(requested/12)*12};
 }
 return sameOptimization(project,next)?project:next;
}

export function optimizationAvailability(project){
 if(!project?.images?.length)return {enabled:false,hint:'请先添加图片'};
 if(project.layout!=='horizontal')return {enabled:false,hint:'仅横排可用'};
 try{
  const next=optimizeHorizontal(project);
  if(next===project)return {enabled:false,hint:'当前裁剪已优化'};
  const shared=Object.values(next.edits).some(edit=>edit.fraction>0);
  return {enabled:true,hint:shared?'保留特殊裁剪，其余图片等比例裁去左右两侧':'按选定的特殊裁剪拼排，其余图片保留完整'};
 }catch(error){return {enabled:false,hint:error.message};}
}
