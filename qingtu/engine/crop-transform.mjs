import {imageGeometry,cropEdges,changeCropEdge} from './stitch-edits.mjs';

export const CROP_HANDLES={left:['left'],right:['right'],top:['top'],bottom:['bottom'],nw:['left','top'],ne:['right','top'],se:['right','bottom'],sw:['left','bottom']};

// Convert a side or corner gesture to integer source pixels. Layout and canvas
// fitting are separate so the same crop can be previewed without encoding.
export function cropFromDrag(image,edit,rect,side,dx,dy){
 const before=imageGeometry(image,edit),edges=cropEdges(image,edit),sides=CROP_HANDLES[side];
 const scaleX=rect.width/before.width,scaleY=rect.height/before.height;
 if(!sides||![scaleX,scaleY,dx,dy].every(Number.isFinite)||scaleX<=0||scaleY<=0)throw new Error('裁剪位置或尺寸无效');
 const links={horizontal:edit?.links?.horizontal??true,vertical:edit?.links?.vertical??false};
 let changed=edges;
 for(const edge of sides){
  const horizontal=['left','right'].includes(edge),amount=edges[edge]+(horizontal?dx/scaleX:dy/scaleY)*(['right','bottom'].includes(edge)?-1:1);
  changed=changeCropEdge(image,changed,edge,amount,links[horizontal?'horizontal':'vertical']);
 }
 const next={edges:changed,links},after=imageGeometry(image,next);
 return {edit:next,position:{x:rect.x+(after.left-before.left)*scaleX,y:rect.y+(after.top-before.top)*scaleY,width:after.width*scaleX,height:after.height*scaleY}};
}
