import {imageGeometry,cropFractions} from './stitch-edits.mjs';
import {MAX_EDGE,MAX_RATIO,FOUR_VIEW_RATIO,validateCanvas} from './canvas-limits.mjs';
import {calculateFixedLayout} from './canvas-fixed.mjs';
export {MAX_EDGE,MAX_RATIO,validateCanvas} from './canvas-limits.mjs';
export function moveImage(images,from,to){const copy=[...images];const index=copy.findIndex(i=>i.id===from),target=copy.findIndex(i=>i.id===to);if(index<0||target<0)return copy;copy.splice(target,0,...copy.splice(index,1));return copy;}
export function appendFreeImages(project,added){
 const positions={...project.positions},existing=project.images||[];
 const first=existing[0],firstPosition=first&&positions[first.id];
 const firstSource=first&&imageGeometry(first,project.edits?.[first.id]);
 const baseHeight=firstPosition?firstPosition.width*firstSource.height/firstSource.width:added[0]?.height;
 let right=existing.length?Math.max(...existing.map(i=>positions[i.id].x+positions[i.id].width)):0;
 const top=existing.length?Math.min(...existing.map(i=>positions[i.id].y)):0;
 for(const image of added){const width=baseHeight*image.width/image.height;positions[image.id]={x:right,y:top,width};right+=width;}
 return {...project,images:[...existing,...added],positions};
}
export function initializeFree(project,layout,policy){
 if(layout.rects.some(r=>r.autoCrop)&&!['centres','reflow'].includes(policy))throw new Error('请确认裁切图片进入自由画布的初始化规则');
 let right=0;
 const positions=Object.fromEntries(layout.rects.map(rect=>{
  const image=project.images.find(i=>i.id===rect.id),source=imageGeometry(image,project.edits?.[image.id]),width=rect.height*source.width/source.height;
  const x=policy==='reflow'?right:rect.x+(rect.width-width)/2;right+=width;
  return [image.id,{x,y:rect.y,width}];
 }));
 return {...project,layout:'free',positions};
}
export function snapPosition(rect,others,tolerance=8){
 let x=rect.x,y=rect.y;const guides=[];
 for(const axis of ['x','y']){
  const size=axis==='x'?'width':'height';let best=tolerance+1,offset=0,guide;
  for(const other of others)for(const anchor of [other[axis],other[axis]+other[size]/2,other[axis]+other[size]])for(const local of [0,rect[size]/2,rect[size]]){
   const delta=anchor-rect[axis]-local;if(Math.abs(delta)<best){best=Math.abs(delta);offset=delta;guide=anchor;}
  }
  if(best<=tolerance){if(axis==='x')x+=offset;else y+=offset;guides.push({axis,value:guide});}
 }
 return {x,y,guides};
}
function resolution(width,height,longEdge,draft=false,exact=false){
 if(!Number.isInteger(longEdge)||longEdge<1||longEdge>MAX_EDGE)throw new Error('长边须为 1–5999 像素');
 if(exact){
  if(!draft&&longEdge%5!==0)throw new Error('严格 2.5:1 的长边须为 5 的倍数（5–5995 px）');
  longEdge=Math.floor(longEdge/5)*5;
  if(longEdge<5)throw new Error('严格 2.5:1 的长边至少为 5 像素');
 }
 const factor=longEdge/Math.max(width,height);
 let w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
 // Round the short side up at the ratio boundary, never extend a canvas.
 if(!draft&&width>=height&&width/height<=FOUR_VIEW_RATIO+1e-12&&w/h>FOUR_VIEW_RATIO)h=Math.ceil(w/FOUR_VIEW_RATIO);
 if(!draft){if(w/h>MAX_RATIO)h=Math.ceil(w/MAX_RATIO);if(h/w>MAX_RATIO)w=Math.ceil(h/MAX_RATIO);validateCanvas(w,h);}
 return {width:w,height:h,factor};
}
export function calculateLayout(project,{draft=false}={}){
 if(project.canvasMode==='fixed')return calculateFixedLayout(project,{draft});
 const originals=project.images||[];if(!originals.length)throw new Error('请添加图片');
 if(originals.some(i=>![i.width,i.height].every(v=>Number.isInteger(v)&&v>0)))throw new Error('图片尺寸无效');
 const images=originals.map(image=>{const source=imageGeometry(image,project.edits?.[image.id]);return {...image,original:image,source,width:source.width,height:source.height};});
 if(images.length>100||images.some(i=>![i.width,i.height].every(v=>Number.isFinite(v)&&v>0)))throw new Error('图片尺寸无效');
 let longEdge=Number(project.export?.longEdge??MAX_EDGE);if(draft&&(!Number.isInteger(longEdge)||longEdge<1||longEdge>MAX_EDGE))longEdge=MAX_EDGE;
 const type=project.layout||'horizontal',resolve=(w,h,exact=false)=>resolution(w,h,longEdge,draft,exact);
 const cropDetails=image=>({crop:cropFractions(image.original,image.source),...(project.edits?.[image.id]?.fraction!=null?{proportionalCrop:true}:{})});
 let width,height,rects;
 if(type==='horizontal'){
  let ratios=images.map(i=>i.width/i.height),ratio=ratios.reduce((a,b)=>a+b,0);
  const exact=images.some(i=>project.edits?.[i.id]?.fraction!=null)&&Math.abs(ratio-MAX_RATIO)<1e-12;
  if(exact)ratio=MAX_RATIO;
  if(!draft&&ratio<1/MAX_RATIO)throw new Error('横排画布比例超过 2.5，请调整布局');
  const cropIndices=images.map((i,n)=>i.original.width*16===i.original.height*9&&!i.source.left&&!i.source.top?n:-1).filter(n=>n>=0);
  if(ratio>MAX_RATIO&&(!draft||cropIndices.length&&ratio-MAX_RATIO<cropIndices.reduce((s,n)=>s+ratios[n],0))){
   const excess=ratio-MAX_RATIO;
   if(!cropIndices.length||excess>=cropIndices.reduce((s,n)=>s+ratios[n],0))throw new Error('横排比例超过 2.5，仅 9:16 图片可居中裁切，请调整布局');
   const amount=excess/cropIndices.length;
   for(const n of cropIndices){if(ratios[n]<=amount)throw new Error('9:16 图片不足以满足比例限制，请调整布局');ratios[n]-=amount;}
   ratio=MAX_RATIO;
  }
  ({width,height}=resolve(ratio,1,exact));
  // Keep uncropped image widths at rounded equal-height scale. Distribute the
  // remaining integer pixels among the eligible cropped pictures.
  const atLimit=exact||Math.abs(ratio-FOUR_VIEW_RATIO)<1e-12;
  const widths=ratios.map(r=>atLimit?Math.floor(r*height):Math.round(r*height));
  let difference=width-widths.reduce((s,w)=>s+w,0);
  const eligible=atLimit?images.map((_,i)=>i).sort((a,b)=>(ratios[b]*height-widths[b])-(ratios[a]*height-widths[a])):ratio===MAX_RATIO&&cropIndices.length?cropIndices:images.map((_,i)=>i);
  for(let k=0;difference!==0;k++){const n=eligible[k%eligible.length],delta=Math.sign(difference);if(widths[n]+delta<1)throw new Error('分辨率过低，请增加长边');widths[n]+=delta;difference-=delta;}
  let x=0;
  rects=images.map((image,n)=>{
   const sourceWidth=image.width/image.height*height;
   const cropped=cropIndices.includes(n)&&ratios[n]<image.width/image.height;
   const rect={id:image.id,assetId:image.assetId,x,y:0,width:widths[n],height,autoCrop:cropped,...cropDetails(image)};if(cropped)rect.crop={left:(1-widths[n]/sourceWidth)/2,right:(1-widths[n]/sourceWidth)/2};x+=widths[n];return rect;
  });
 }else if(type==='vertical'){
  const ratio=images.reduce((s,i)=>s+i.height/i.width,0);if(!draft&&Math.max(ratio,1/ratio)>MAX_RATIO)throw new Error('竖排比例超过 2.5，请调整布局');
  ({width,height}=resolve(1,ratio));let y=0;
  rects=images.map((image,n)=>{const bottom=n===images.length-1?height:Math.round(images.slice(0,n+1).reduce((s,i)=>s+i.height/i.width*width,0));const rect={id:image.id,assetId:image.assetId,x:0,y,width,height:bottom-y,...cropDetails(image)};y=bottom;return rect;});
 }else if(type==='grid'){
  const rows=Number(project.grid?.rows),columns=Number(project.grid?.columns);
  if(![rows,columns].every(v=>Number.isInteger(v)&&v>=1&&v<=100)||images.length<rows||images.length>rows*columns)throw new Error('行列无法容纳全部图片，请调整宫格');
  const groups=[];let offset=0;
  for(let row=0;row<rows;row++){
   const length=Math.min(columns,images.length-offset-(rows-row-1));
   const group=images.slice(offset,offset+length),sum=group.reduce((s,i)=>s+i.width/i.height,0);
   groups.push({images:group,height:1/sum});offset+=length;
  }
  const totalHeight=groups.reduce((s,g)=>s+g.height,0);
  if(!draft&&Math.max(totalHeight,1/totalHeight)>MAX_RATIO)throw new Error('宫格画布比例超过 2.5，请调整行列');
  ({width,height}=resolve(1,totalHeight));let y=0;rects=[];
  for(let row=0;row<groups.length;row++){
   const group=groups[row],bottom=row===groups.length-1?height:Math.round(groups.slice(0,row+1).reduce((s,g)=>s+g.height,0)/totalHeight*height);
   let x=0,ratioSum=0;const sum=1/group.height;
   for(let col=0;col<group.images.length;col++){
    const image=group.images[col];ratioSum+=image.width/image.height;
    const right=col===group.images.length-1?width:Math.round(ratioSum/sum*width);
    rects.push({id:image.id,assetId:image.assetId,x,y,width:right-x,height:bottom-y,...cropDetails(image)});x=right;
   }y=bottom;
  }
 }else if(type==='free'){
  const positions=project.positions||{};
  const source=images.map(image=>{
   const r=positions[image.id];if(!r||![r.x,r.y,r.width].every(Number.isFinite)||r.width<=0)throw new Error('自由画布图片位置无效');
   return {id:image.id,assetId:image.assetId,x:r.x,y:r.y,width:r.width,height:r.width*image.height/image.width,...cropDetails(image)};
  });
  // User-confirmed: bounds always include every complete image.
  const left=Math.min(...source.map(r=>r.x)),top=Math.min(...source.map(r=>r.y));
  const naturalWidth=Math.max(...source.map(r=>r.x+r.width))-left,naturalHeight=Math.max(...source.map(r=>r.y+r.height))-top;
  if(!draft&&Math.max(naturalWidth,naturalHeight)/Math.min(naturalWidth,naturalHeight)>MAX_RATIO)throw new Error('自由画布比例超过 2.5，请调整图片位置');
  ({width,height}=resolve(naturalWidth,naturalHeight));
  rects=source.map(r=>{const x=Math.round((r.x-left)*width/naturalWidth),y=Math.round((r.y-top)*height/naturalHeight);return {...r,x,y,width:Math.round((r.x+r.width-left)*width/naturalWidth)-x,height:Math.round((r.y+r.height-top)*height/naturalHeight)-y};});
 }else throw new Error('布局类型无效');
 if(!draft&&rects.some(r=>r.width<1||r.height<1||r.x<0||r.y<0||r.x+r.width>width||r.y+r.height>height))throw new Error('图片超出画布或分辨率过低，请调整布局');
 return {width,height,rects,type};
}
