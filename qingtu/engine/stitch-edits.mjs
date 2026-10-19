import {sourceWindow} from './image-source.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';
const horizontalAxes=['horizontal','left','right'],singleAxes=['left','right','top','bottom'];
export const cropLimit=(image,axis)=>Math.floor(((horizontalAxes.includes(axis)?image.width:image.height)-1)/(singleAxes.includes(axis)?1:2));

export function imageGeometry(image,edit){
 sourceWindow(image);
 if(edit?.edges){
  const {left,top,right,bottom}=edit.edges;
  if(edit.axis!=null||edit.amount!=null||edit.fraction!=null||![left,top,right,bottom].every(v=>Number.isInteger(v)&&v>=0)||left+right>=image.width||top+bottom>=image.height)throw new Error('四边裁剪须为有效的原图像素，且至少保留 1 像素');
  if(edit.links&&(!['horizontal','vertical'].every(key=>typeof edit.links[key]==='boolean')))throw new Error('裁剪关联设置无效');
  return {left,top,width:image.width-left-right,height:image.height-top-bottom};
 }
 const axis=edit?.axis??'horizontal',amount=edit?.amount??0;
 if(edit?.fraction!=null){
  const fraction=edit.fraction;
  if(!['horizontal','vertical'].includes(axis)||edit.amount!=null||!Number.isFinite(fraction)||fraction<0||fraction>=.5||image[axis==='horizontal'?'width':'height']*(1-2*fraction)<1)throw new Error('等比例裁剪数据无效');
  return axis==='horizontal'?{left:image.width*fraction,top:0,width:image.width*(1-2*fraction),height:image.height}:{left:0,top:image.height*fraction,width:image.width,height:image.height*(1-2*fraction)};
 }
 if(!['horizontal','vertical',...singleAxes].includes(axis)||!Number.isInteger(amount)||amount<0||amount>cropLimit(image,axis))throw new Error('单图裁剪须为有效的原图像素，且至少保留 1 像素');
 const left=['horizontal','left'].includes(axis)?amount:0,top=['vertical','top'].includes(axis)?amount:0;
 const right=['horizontal','right'].includes(axis)?amount:0,bottom=['vertical','bottom'].includes(axis)?amount:0;
 return {left,top,width:image.width-left-right,height:image.height-top-bottom};
}
export function cropFractions(image,source){
 const window=sourceWindow(image),left=window.left+source.left,top=window.top+source.top;
 let right=window.fullWidth-left-source.width,bottom=window.fullHeight-top-source.height;
 if(Math.abs(right-left)<1e-9)right=left;if(Math.abs(bottom-top)<1e-9)bottom=top;
 if(!left&&!top&&!right&&!bottom)return null;
 return {left:left/window.fullWidth,right:right/window.fullWidth,top:top/window.fullHeight,bottom:bottom/window.fullHeight};
}
export function setImageEdit(project,id,edit){
 const image=project.images.find(image=>image.id===id);if(!image)throw new Error('图片已移除');
 const before=imageGeometry(image,project.edits?.[id]),after=imageGeometry(image,edit);
 const next={...project,edits:{...project.edits,[id]:edit.edges?{edges:{...edit.edges},links:{horizontal:edit.links?.horizontal??true,vertical:edit.links?.vertical??false}}:{axis:edit.axis,amount:edit.amount}}};
 if(before.width===after.width&&before.height===after.height)return next;
 if(project.canvasMode==='fixed'||project.layout==='free'){
  if(project.heightLocked&&project.layout==='horizontal'){
   const p=project.positions[id],width=p.width*after.width/before.width*before.height/after.height;
   next.positions={...project.positions,[id]:{...p,width}};
   return fitHeightCanvas(next);
  }
  const p=project.positions[id],scale=p.width/before.width,width=after.width*scale;
  const height=project.canvasMode==='fixed'?p.height*after.height/before.height:after.height*scale;
  const oldHeight=project.canvasMode==='fixed'?p.height:before.height*scale;
  next.positions={...project.positions,[id]:{x:p.x+(p.width-width)/2,y:p.y+(oldHeight-height)/2,width,...(project.canvasMode==='fixed'?{height}:{})}};
 }
 return next;
}

export function cropEdges(image,edit){
 const source=imageGeometry(image,edit);
 const edges={left:Math.round(source.left),top:Math.round(source.top),right:Math.round(image.width-source.left-source.width),bottom:Math.round(image.height-source.top-source.height)};
 if(edges.left+edges.right>=image.width){edges.left=Math.floor(source.left);edges.right=Math.floor(image.width-source.left-source.width);}
 if(edges.top+edges.bottom>=image.height){edges.top=Math.floor(source.top);edges.bottom=Math.floor(image.height-source.top-source.height);}
 return edges;
}
export function changeCropEdge(image,edges,side,amount,linked){
 if(!['left','right','top','bottom'].includes(side))throw new Error('裁剪边无效');
 const opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[side],size=['left','right'].includes(side)?image.width:image.height;
 const maximum=linked?Math.floor((size-1)/2):size-1-edges[opposite],value=Math.max(0,Math.min(maximum,Math.round(Number(amount)||0)));
 return {...edges,[side]:value,...(linked?{[opposite]:value}:{})};
}
