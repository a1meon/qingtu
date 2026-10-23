import {imageRotation,sourceWindow} from './image-source.mjs';

const turnPose=p=>({...p,x:p.x+(p.width-p.height)/2,y:p.y+(p.height-p.width)/2,width:p.height,height:p.width});
function turnEdit(edit){
 if(!edit)return edit;
 if(edit.edges){const {left,top,right,bottom}=edit.edges;return {...edit,edges:{left:bottom,top:left,right:top,bottom:right},...(edit.links?{links:{horizontal:edit.links.vertical,vertical:edit.links.horizontal}}:{})};}
 return {...edit,axis:({horizontal:'vertical',vertical:'horizontal',left:'top',top:'right',right:'bottom',bottom:'left'})[edit.axis??'horizontal']};
}
// Quarter turns permute the original pixel coordinates. No new source asset,
// resampling or layout reflow is needed, including for already split pieces.
export function rotateProjectImage(project,id,degrees){
 if(!Number.isSafeInteger(degrees)||degrees%90)throw new Error('旋转角度须为 90° 的整数倍');
 const index=project.images.findIndex(image=>image.id===id);if(index<0)throw new Error('图片已移除');
 if(project.canvasMode!=='fixed')throw new Error('请在固定画布中旋转图片');
 const turns=((degrees/90)%4+4)%4;if(!turns)return project;
 let next=project;
 for(let n=0;n<turns;n++){
  const image=next.images[index],window=sourceWindow(image),rotation=(imageRotation(image)+90)%360;
  const source=image.source?{left:window.fullHeight-window.top-window.height,top:window.left,width:window.height,height:window.width,fullWidth:window.fullHeight,fullHeight:window.fullWidth}:undefined;
  const turned={...image,width:image.height,height:image.width,rotation,...(source?{source}:{})};
  const layoutStates=next.layoutStates&&Object.fromEntries(Object.entries(next.layoutStates).map(([mode,state])=>[mode,state[id]?{...state,[id]:turnPose(state[id])}:state]));
  const size=next.importSizes?.[id];
  next={...next,images:next.images.map((value,i)=>i===index?turned:value),positions:{...next.positions,[id]:turnPose(next.positions[id])},edits:{...next.edits,...(next.edits?.[id]?{[id]:turnEdit(next.edits[id])}:{})},...(layoutStates?{layoutStates}:{}),...(size?{importSizes:{...next.importSizes,[id]:{width:size.height,height:size.width}}}:{})};
 }
 return next;
}

export function normalizeImageAngle(angle){
 if(!Number.isFinite(angle))throw new Error('旋转角度无效');
 let value=Math.round((((angle+180)%360+360)%360-180)*10000)/10000;if(value>=180)value-=360;return Object.is(value,-0)?0:value;
}
export function setProjectImageAngle(project,id,angle){
 const image=project.images.find(value=>value.id===id);if(!image)throw new Error('图片已移除');
 if(project.canvasMode!=='fixed')throw new Error('请在固定画布中旋转图片');
 const fine=normalizeImageAngle(angle-imageRotation(image));
 return {...project,images:project.images.map(value=>value.id===id?{...value,angle:fine}:value)};
}
export function rotateVector(x,y,angle){
 const radians=angle*Math.PI/180,cos=Math.abs(Math.cos(radians))<1e-12?0:Math.cos(radians),sin=Math.abs(Math.sin(radians))<1e-12?0:Math.sin(radians);
 return {x:x*cos-y*sin,y:x*sin+y*cos};
}
export function rotatedImageBounds(rect,angle=0){
 const a=rotateVector(rect.width,0,angle),b=rotateVector(0,rect.height,angle),width=Math.abs(a.x)+Math.abs(b.x),height=Math.abs(a.y)+Math.abs(b.y);
 return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height};
}

export function rotatePoseAround(pose,pivot,angle){
 const centre=rotateVector(pose.x+pose.width/2-pivot.x-pivot.width/2,pose.y+pose.height/2-pivot.y-pivot.height/2,angle);
 return {...pose,x:pivot.x+pivot.width/2+centre.x-pose.width/2,y:pivot.y+pivot.height/2+centre.y-pose.height/2};
}

export function angleFromCornerDrag(startAngle,startRay,currentRay,shift=false){
 const angle=startAngle+normalizeImageAngle(currentRay-startRay);
 return normalizeImageAngle(shift?Math.round(angle/45)*45:angle);
}
