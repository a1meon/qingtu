import {MAX_EDGE,FOUR_VIEW_RATIO,canvasRatioLimit} from './canvas-limits.mjs';

// Height is authoritative. Wider content stays editable outside the capped
// canvas; neither image pixels nor their scale are changed to satisfy the cap.
export function fitHeightCanvas(project,{reflow=project.layout==='horizontal'}={}){
 if(!project.images.length)return project;
 const height=project.canvas.height,maxRatio=project.sourceCanvas?canvasRatioLimit(project.sourceCanvas):FOUR_VIEW_RATIO;
 if(!Number.isInteger(height)||height<1||height>MAX_EDGE)throw new Error('画布高度须为 1–5999 像素');
 const positions={...project.positions};let x=0;
 for(const image of project.images){
  const p=positions[image.id];
  if(!p||![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0)throw new Error('图片位置或尺寸无效');
  if(reflow){positions[image.id]={...p,x};x+=p.width;}
 }
 if(project.canvasSizing==='manual')return {...project,positions};
 const right=Math.max(...project.images.map(image=>positions[image.id].x+positions[image.id].width));
 const ratioWidth=Math.floor(height*maxRatio);
 const nativeWidth=height===project.sourceCanvas?.height?project.sourceCanvas.width:0;
 const width=Math.max(1,Math.min(MAX_EDGE,Math.max(ratioWidth,nativeWidth),Math.round(right)));
 return {...project,positions,canvas:{width,height}};
}

export function enableHeightCanvas(project){
 if(project.canvasMode!=='fixed'||project.heightLocked!==undefined)return project;
 if(!Number.isInteger(project.canvas?.height)||project.canvas.height<1||project.canvas.height>MAX_EDGE)return {...project,heightLocked:true};
 return fitHeightCanvas({...project,heightLocked:true},{reflow:false});
}
