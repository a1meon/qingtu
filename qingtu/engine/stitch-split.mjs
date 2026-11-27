import {imageGeometry} from './stitch-edits.mjs';
import {rotatePoseAround} from './image-rotation.mjs';
import {identifyLegacySplits,splitOrigin} from './split-origin.mjs';
import {sourceWindow} from './image-source.mjs';
import {knownImportOrder} from './stitch-reset.mjs';
import {splitLayoutStates} from './canvas-layout-state.mjs';
import {splitImportSize} from './import-sizes.mjs';

export function fullSourcePosition(project,id){
 const image=project.images.find(image=>image.id===id);
 if(!image)throw new Error('图片已移除');
 const before=imageGeometry(image,project.edits?.[id]),position=project.positions[id];
 const width=position.width*image.width/before.width,height=position.height*image.height/before.height;
 return {x:position.x+(position.width-width)/2,y:position.y+(position.height-height)/2,width,height};
}

// Geometry-only source windows: confirming a split never re-encodes or copies
// high-resolution pixels. The immutable original remains recoverable once.
export function splitProjectImage(project,id,axis,at,ids){
 if(project.canvasMode!=='fixed')throw new Error('请在固定画布中拆分');
 project=identifyLegacySplits(project);
 const index=project.images.findIndex(image=>image.id===id),image=project.images[index];
 if(!image)throw new Error('图片已移除');
 if(project.images.length>=100)throw new Error('每个项目最多 100 张图片');
 if(!['x','y'].includes(axis)||!Number.isInteger(at)||at<1||at>=(axis==='x'?image.width:image.height))throw new Error('分割线须在图片内，且两侧至少保留 1 像素');
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||ids.some(next=>typeof next!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(next)||project.images.some(image=>image.id===next)))throw new Error('拆分图片标识无效');
 const window=sourceWindow(image),{x,y,width,height}=fullSourcePosition(project,id);
 const first={left:window.left,top:window.top,width:axis==='x'?at:image.width,height:axis==='y'?at:image.height,fullWidth:window.fullWidth,fullHeight:window.fullHeight};
 const second={...window,left:window.left+(axis==='x'?at:0),top:window.top+(axis==='y'?at:0),width:axis==='x'?image.width-at:image.width,height:axis==='y'?image.height-at:image.height};
 const labels=axis==='x'?['左','右']:['上','下'];
 const origin=image.splitOrigin||splitOrigin(project,image);
 const pieces=[first,second].map((source,n)=>({...image,splitOrigin:origin,id:ids[n],name:(image.name||'图片').slice(0,190)+' · '+labels[n],width:source.width,height:source.height,source}));
 const fraction=at/(axis==='x'?image.width:image.height),positions={...project.positions},edits={...project.edits};delete positions[id];delete edits[id];
 positions[ids[0]]={x,y,width:axis==='x'?width*fraction:width,height:axis==='y'?height*fraction:height};
 positions[ids[1]]={x:x+(axis==='x'?positions[ids[0]].width:0),y:y+(axis==='y'?positions[ids[0]].height:0),width:axis==='x'?width-positions[ids[0]].width:width,height:axis==='y'?height-positions[ids[0]].height:height};
 if(image.angle)for(const child of ids)positions[child]=rotatePoseAround(positions[child],{x,y,width,height},image.angle);
 const images=[...project.images.slice(0,index),...pieces,...project.images.slice(index+1)],order=knownImportOrder(project);
 return {...project,images,positions,edits,...(project.importSizes?{importSizes:splitImportSize(project.importSizes,id,ids,axis,fraction,image.angle||0)}:{}),...(project.layoutStates?{layoutStates:splitLayoutStates(project.layoutStates,id,ids,axis,fraction,image.angle||0)}:{}),...(order?{initialOrder:order.flatMap(value=>value===id?ids:[value])}:{})};
}
