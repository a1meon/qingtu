import {resizeImageRect} from './canvas-transform.mjs';

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
