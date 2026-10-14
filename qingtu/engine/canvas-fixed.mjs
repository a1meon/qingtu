import {imageGeometry,cropFractions} from './stitch-edits.mjs';
import {DEFAULT_CANVAS,validateCanvas} from './canvas-limits.mjs';
import {fitCanvasToContent} from './canvas-fit.mjs';
function validateGrid(grid,count){const rows=Number(grid?.rows),columns=Number(grid?.columns);if(![rows,columns].every(v=>Number.isInteger(v)&&v>=1&&v<=100)||count<rows||count>rows*columns)throw new Error('行列无法容纳全部图片，请调整宫格');return {rows,columns};}

export function calculateFixedLayout(project,{draft=false}={}){
 if(project.layout&&!['horizontal','vertical','grid','free'].includes(project.layout))throw new Error('布局类型无效');
 let {width,height}=project.canvas||DEFAULT_CANVAS;
 if(!draft)validateCanvas(width,height);
 else {width=Number.isFinite(width)&&width>0?width:DEFAULT_CANVAS.width;height=Number.isFinite(height)&&height>0?height:DEFAULT_CANVAS.height;}
 const images=project.images||[];
 if(images.length>100||images.some(image=>![image.width,image.height].every(v=>Number.isInteger(v)&&v>0)))throw new Error('图片尺寸无效');
 if(!draft&&images.length&&project.layout==='grid')validateGrid(project.grid,images.length);
 const rects=images.map(image=>{
  const position=project.positions?.[image.id],source=imageGeometry(image,project.edits?.[image.id]);
  if(!position||![position.x,position.y,position.width,position.height].every(Number.isFinite)||position.width<=0||position.height<=0)throw new Error('图片位置或尺寸无效');
  return {id:image.id,assetId:image.assetId,x:position.x,y:position.y,width:position.width,height:position.height,crop:cropFractions(image,source),...(project.edits?.[image.id]?.fraction!=null?{proportionalCrop:true}:{})};
 });
 return {width,height,rects,type:project.layout||'horizontal',fixed:true};
}

// Shared normalized arrangements. The caller chooses whether to retain an
// explicitly sized canvas or fit it to content; neither changes source crops.
function arrangement(project,type,grid){
 if(!['horizontal','vertical','grid'].includes(type))throw new Error('布局类型无效');
 const images=project.images.map(image=>({...image,source:imageGeometry(image,project.edits?.[image.id])}));
 if(!images.length)return {width:1,height:1,rects:[]};
 let width,height,rects=[];
 if(type==='horizontal'){
  width=images.reduce((sum,image)=>sum+image.source.width/image.source.height,0);height=1;
  let x=0;for(const image of images){const w=image.source.width/image.source.height;rects.push({id:image.id,x,y:0,width:w,height:1});x+=w;}
 }else if(type==='vertical'){
  width=1;height=images.reduce((sum,image)=>sum+image.source.height/image.source.width,0);
  let y=0;for(const image of images){const h=image.source.height/image.source.width;rects.push({id:image.id,x:0,y,width:1,height:h});y+=h;}
 }else{
  const {rows,columns}=validateGrid(grid,images.length);
  width=1;height=0;let offset=0;
  for(let row=0;row<rows;row++){
   const length=Math.min(columns,images.length-offset-(rows-row-1)),group=images.slice(offset,offset+length);
   const sum=group.reduce((total,image)=>total+image.source.width/image.source.height,0),h=1/sum;
   let x=0;for(const image of group){const w=h*image.source.width/image.source.height;rects.push({id:image.id,x,y:height,width:w,height:h});x+=w;}
   height+=h;offset+=length;
  }
 }
 return {width,height,rects};
}
export function arrangeImages(project,type=project.layout,grid=project.grid){
 validateCanvas(project.canvas.width,project.canvas.height);
 if(type==='free')return {...project,layout:type};
 const {width,height,rects}=arrangement(project,type,grid);
 const scale=Math.min(project.canvas.width/width,project.canvas.height/height);
 const left=(project.canvas.width-width*scale)/2,top=(project.canvas.height-height*scale)/2;
 const positions=Object.fromEntries(rects.map(rect=>[rect.id,{x:left+rect.x*scale,y:top+rect.y*scale,width:rect.width*scale,height:rect.height*scale}]));
 return {...project,layout:type,grid,positions};
}

export function arrangeContentImages(project,type=project.layout,grid=project.grid){
 if(type==='free')return {...project,layout:type};
 const {rects}=arrangement(project,type,grid);
 return fitCanvasToContent({...project,layout:type,grid,positions:Object.fromEntries(rects.map(({id,...pose})=>[id,pose]))});
}

export function appendFixedImages(project,added){
 const positions={...project.positions},existing=project.images||[],canvas=project.canvas||DEFAULT_CANVAS;
 let right=existing.length?Math.max(...existing.map(image=>positions[image.id].x+positions[image.id].width)):0;
 const top=existing.length?Math.min(...existing.map(image=>positions[image.id].y)):0;
 let baseHeight=existing.length?positions[existing[0].id].height:null;
 for(const image of added){
  const source=imageGeometry(image,project.edits?.[image.id]);
  if(baseHeight===null)baseHeight=Math.min(canvas.height,canvas.width*source.height/source.width);
  const width=baseHeight*source.width/source.height;
  positions[image.id]={x:right,y:top,width,height:baseHeight};right+=width;
 }
 return {...project,images:[...existing,...added],positions};
}
