import {MAX_EDGE,MAX_RATIO} from './canvas-limits.mjs';

// Fit is an explicit import/arrangement operation, never a render side effect.
// Translate and uniformly scale the complete content, including overflow.
export function fitCanvasToContent(project){
 if(!project.images.length)return project;
 const poses=project.images.map(image=>project.positions[image.id]);
 if(poses.some(p=>!p||![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0))throw new Error('图片位置或尺寸无效');
 const left=Math.min(...poses.map(p=>p.x)),top=Math.min(...poses.map(p=>p.y));
 const width=Math.max(...poses.map(p=>p.x+p.width))-left,height=Math.max(...poses.map(p=>p.y+p.height))-top;
 const requested=Number(project.export?.longEdge??MAX_EDGE);
 if(!Number.isInteger(requested)||requested<1||requested>MAX_EDGE)throw new Error('画布长边须为 1–5999 像素');
 const ratio=Math.max(width,height)/Math.min(width,height),exact=Math.abs(ratio-MAX_RATIO)<1e-10&&requested>=5;
 const longEdge=exact?Math.floor(requested/5)*5:requested,scale=longEdge/Math.max(width,height);
 const canvas={width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
 // At a legal ratio boundary, integer pixels may require rounding the short
 // side up. Illegal content keeps its actual bounds and is blocked by normal
 // validation; do not hide it with padding, stretching or source cropping.
 if(ratio<=MAX_RATIO+1e-12&&Math.max(canvas.width,canvas.height)/Math.min(canvas.width,canvas.height)>MAX_RATIO){if(width>=height)canvas.height=Math.ceil(canvas.width/MAX_RATIO);else canvas.width=Math.ceil(canvas.height/MAX_RATIO);}
 const positions=Object.fromEntries(project.images.map(image=>{const p=project.positions[image.id];return [image.id,{x:(p.x-left)*scale,y:(p.y-top)*scale,width:p.width*scale,height:p.height*scale}];}));
 return {...project,canvas,canvasSizing:'content',positions};
}
