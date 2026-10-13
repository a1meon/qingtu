export const cropLimit=(image,axis)=>Math.floor(((axis==='horizontal'?image.width:image.height)-1)/2);

export function imageGeometry(image,edit){
 const axis=edit?.axis??'horizontal',amount=edit?.amount??0;
 if(!['horizontal','vertical'].includes(axis)||!Number.isInteger(amount)||amount<0||amount>cropLimit(image,axis))throw new Error('单图裁剪须为有效的原图像素，且至少保留 1 像素');
 const left=axis==='horizontal'?amount:0,top=axis==='vertical'?amount:0;
 return {left,top,width:image.width-left*2,height:image.height-top*2};
}
export function cropFractions(image,source){
 if(!source.left&&!source.top)return null;
 return {left:source.left/image.width,right:source.left/image.width,top:source.top/image.height,bottom:source.top/image.height};
}
export function setImageEdit(project,id,edit){
 const image=project.images.find(image=>image.id===id);if(!image)throw new Error('图片已移除');
 const before=imageGeometry(image,project.edits?.[id]),after=imageGeometry(image,edit);
 const next={...project,edits:{...project.edits,[id]:{axis:edit.axis,amount:edit.amount}}};
 if(project.layout==='free'){
  const p=project.positions[id],scale=p.width/before.width,width=after.width*scale;
  next.positions={...project.positions,[id]:{x:p.x+(p.width-width)/2,y:p.y+(before.height-after.height)*scale/2,width}};
 }
 return next;
}
