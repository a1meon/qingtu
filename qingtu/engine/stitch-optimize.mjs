import {arrangeImages} from './canvas-fixed.mjs';
import {validateCanvas} from './canvas-limits.mjs';
function targetRatio(project){if(project.canvasMode!=='fixed')return 2.5;const canvas=validateCanvas(project.canvas.width,project.canvas.height);return canvas.width/canvas.height;}
// Work from immutable original dimensions, never from already cropped previews.
export function optimizationAvailability(project){
 if(!project?.images?.length)return {enabled:false,hint:'请先添加图片'};
 if(project.layout!=='horizontal')return {enabled:false,hint:'仅横排可用'};
 const ratio=project.images.reduce((sum,image)=>sum+image.width/image.height,0);
 let target,edits;try{target=targetRatio(project);if(ratio<=target+1e-12)return {enabled:false,hint:'原图横排无需左右裁剪'};edits=proportionalHorizontalEdits(project.images,target);}catch(error){return {enabled:false,hint:error.message};}
 if(Object.keys(project.edits||{}).length===project.images.length&&project.images.every(image=>{const edit=project.edits?.[image.id];return edit?.axis==='horizontal'&&Math.abs(edit.fraction-edits[image.id].fraction)<=1e-12&&edit.amount==null;}))return {enabled:false,hint:'当前裁剪已优化'};
 return {enabled:true,hint:project.canvasMode==='fixed'?'按原图统一左右裁剪并横排铺满画布':'按原图统一左右裁剪为 2.5:1'};
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
 const edits=proportionalHorizontalEdits(project.images,targetRatio(project));
 const requested=Number(project.export?.longEdge??5999);
 if(project.canvasMode!=='fixed'&&(!Number.isInteger(requested)||requested<5||requested>5999))throw new Error('严格 2.5:1 的长边须为 5–5999 px');
 const longEdge=Math.floor(requested/5)*5;
 if(project.canvasMode!=='fixed'&&project.export?.longEdge===longEdge&&Object.keys(project.edits||{}).length===project.images.length&&project.images.every(image=>{
  const previous=project.edits?.[image.id],next=edits[image.id];return previous?.axis===next.axis&&previous?.fraction===next.fraction&&previous?.amount==null;
 }))return project;
 if(project.canvasMode==='fixed'){
  const next=arrangeImages({...project,edits},'horizontal');
  const same=project.images.every(image=>{const previous=project.edits?.[image.id],edit=edits[image.id],p=project.positions[image.id],q=next.positions[image.id];return previous?.axis===edit.axis&&previous?.fraction===edit.fraction&&previous?.amount==null&&['x','y','width','height'].every(key=>Math.abs(p[key]-q[key])<1e-9);});
  return same?project:next;
 }
 return {...project,edits,export:{...project.export,longEdge}};
}
