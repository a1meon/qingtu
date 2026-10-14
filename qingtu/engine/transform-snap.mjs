import {resizeImageRect} from './canvas-transform.mjs';
import {CROP_HANDLES,cropFromDrag} from './crop-transform.mjs';
import {cropEdges,changeCropEdge,imageGeometry,setImageEdit} from './stitch-edits.mjs';

const anchors=rect=>['x','y'].flatMap(axis=>[0,.5,1].map(part=>({axis,part,value:rect[axis]+rect[axis==='x'?'width':'height']*part})));
const targetsFor=targets=>targets.flatMap(rect=>anchors(rect).filter(anchor=>!rect.edgesOnly||anchor.part!==.5));
const coordinate=(rect,{axis,part})=>rect[axis]+rect[axis==='x'?'width':'height']*part;

// Only moving anchors participate. Stationary edges must not trap a gesture.
function nearest(current,low,high,targets,tolerance){
 let best;
 for(const anchor of anchors(current).filter(anchor=>anchor.part!==.5)){
  const a=coordinate(low,anchor),b=coordinate(high,anchor);
  if(Math.abs(a-b)<1e-8)continue;
  for(const target of targets){
   if(target.axis!==anchor.axis||target.value<Math.min(a,b)-1e-8||target.value>Math.max(a,b)+1e-8)continue;
   const distance=Math.abs(target.value-anchor.value);
   if(distance<=tolerance&&(!best||distance<best.distance))best={...anchor,target:target.value,distance,a,b};
  }
 }
 return best;
}
function guideFor(rect,hit,tolerance=1){
 return hit&&Math.abs(coordinate(rect,hit)-hit.target)<=tolerance?[{axis:hit.axis,value:hit.target}]:[];
}

export function snapResizeRect(rect,handle,dx,dy,targets,tolerance=8,shift=false,place=rect=>rect){
 const raw=resizeImageRect(rect,handle,dx,dy,shift),horizontal=handle.includes('e')?1:handle.includes('w')?-1:0,vertical=handle.includes('s')?1:handle.includes('n')?-1:0;
 const targetAnchors=targetsFor(targets),fromSize=(width,height)=>({...rect,width,height,x:rect.x+(horizontal<0?rect.width-width:horizontal===0?(rect.width-width)/2:0),y:rect.y+(vertical<0?rect.height-height:vertical===0?(rect.height-height)/2:0)});
 if(!shift){
  const at=factor=>fromSize(rect.width*factor,rect.height*factor),factor=raw.width/rect.width;
  const hit=nearest(place(raw),place(at(0)),place(at(Math.max(2,factor*2))),targetAnchors.filter(target=>target.axis==='x'?horizontal:vertical),tolerance);
  if(!hit)return {...raw,guides:[]};
  const a=coordinate(place(at(0)),hit),b=coordinate(place(at(1)),hit),snapped=(hit.target-a)/(b-a);
  if(!Number.isFinite(snapped)||snapped<1/Math.min(rect.width,rect.height))return {...raw,guides:[]};
  const result=at(snapped);return {...result,guides:guideFor(place(result),hit)};
 }
 let result=raw;const guides=[];
 for(const axis of ['x','y']){
  if(axis==='x'?!horizontal:!vertical)continue;
  const size=axis==='x'?'width':'height',at=value=>fromSize(axis==='x'?value:result.width,axis==='y'?value:result.height),maximum=Math.max(rect[size],result[size])*2;
  const hit=nearest(place(result),place(at(1)),place(at(maximum)),targetAnchors.filter(target=>target.axis===axis),tolerance);
  if(!hit)continue;
  const a=coordinate(place(at(1)),hit),b=coordinate(place(at(2)),hit),value=1+(hit.target-a)/(b-a);
  if(!Number.isFinite(value)||value<1)continue;
  result=at(value);guides.push(...guideFor(place(result),hit));
 }
 return {...result,guides};
}

// Evaluate alignment against the actual fitted layout, including the fixed
// display height and horizontal reflow used by the final committed edit.
export function snapCropFromDrag(project,id,edit,rect,handle,dx,dy,targets,tolerance=8){
 const image=project.images.find(image=>image.id===id),raw=cropFromDrag(image,edit,rect,handle,dx,dy),base=imageGeometry(image,edit),targetAnchors=targetsFor(targets);
 let next=raw.edit;const hits=[],boundary=[];
 for(const side of CROP_HANDLES[handle]){
  const horizontal=['left','right'].includes(side),axis=horizontal?'horizontal':'vertical',size=horizontal?image.width:image.height,opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[side];
  const edges=cropEdges(image,next),linked=next.links[axis],maximum=linked?Math.floor((size-1)/2):size-1-edges[opposite];
  const sourceScale=horizontal?rect.width/base.width:rect.height/base.height;
  if(edges[side]*sourceScale<=tolerance){next={...next,edges:changeCropEdge(image,edges,side,0,linked)};boundary.push(side);continue;}
  const editAt=value=>({...next,edges:changeCropEdge(image,edges,side,value,linked)}),at=value=>setImageEdit(project,id,editAt(value)).positions[id];
  const hit=nearest(at(edges[side]),at(0),at(maximum),targetAnchors,tolerance);
  if(!hit)continue;
  let low=0,high=maximum;const increasing=hit.b>hit.a;
  // Source pixels are integers; bounded binary search also handles reciprocal
  // width changes caused by cropping top/bottom at fixed display height.
  while(high-low>1){const middle=Math.floor((low+high)/2),value=coordinate(at(middle),hit);if((value<hit.target)===increasing)low=middle;else high=middle;}
  const amount=[low,high].reduce((best,value)=>Math.abs(coordinate(at(value),hit)-hit.target)<Math.abs(coordinate(at(best),hit)-hit.target)?value:best,low);
  next=editAt(amount);hits.push(hit);
 }
 const position=setImageEdit(project,id,next).positions[id],guides=hits.flatMap(hit=>guideFor(position,hit));
 for(const side of boundary){const axis=['left','right'].includes(side)?'x':'y',value=position[axis]+(['right','bottom'].includes(side)?position[axis==='x'?'width':'height']:0);guides.push({axis,value});}
 return {edit:next,position,guides:guides.filter((guide,index,all)=>all.findIndex(other=>guide.axis===other.axis&&Math.abs(guide.value-other.value)<1e-6)===index)};
}
