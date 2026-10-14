import {imageGeometry,cropEdges,changeCropEdge} from './stitch-edits.mjs';

// Keep the source scale fixed while the edge follows the pointer. The normal
// layout policy is applied only after release, not on every preview frame.
export function cropFromDrag(image,edit,rect,side,dx,dy){
 const before=imageGeometry(image,edit),edges=cropEdges(image,edit),horizontal=['left','right'].includes(side);
 const scaleX=rect.width/before.width,scaleY=rect.height/before.height;
 if(![scaleX,scaleY,dx,dy].every(Number.isFinite)||scaleX<=0||scaleY<=0)throw new Error('裁剪位置或尺寸无效');
 const links={horizontal:edit?.links?.horizontal??true,vertical:edit?.links?.vertical??false};
 const amount=edges[side]+(horizontal?dx/scaleX:dy/scaleY)*(['right','bottom'].includes(side)?-1:1);
 const next={edges:changeCropEdge(image,edges,side,amount,links[horizontal?'horizontal':'vertical']),links},after=imageGeometry(image,next);
 return {edit:next,position:{x:rect.x+(after.left-before.left)*scaleX,y:rect.y+(after.top-before.top)*scaleY,width:after.width*scaleX,height:after.height*scaleY}};
}
