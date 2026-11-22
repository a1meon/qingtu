import {DEFAULT_CANVAS,fitExportDimensions,MAX_EDGE,MAX_RATIO,FOUR_VIEW_RATIO} from './canvas-limits.mjs';
import {appendProjectImages} from './stitch-reset.mjs';
import {fitImportedCanvas,rememberCanvasLayout} from './canvas-layout-state.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {originalBytes} from './image-source.mjs';
import {recordImportSizes} from './import-sizes.mjs';

function setImportFrame(project,canvas){
 const longest=Math.max(canvas.width,canvas.height);
 const panoramic=longest/Math.min(canvas.width,canvas.height)>FOUR_VIEW_RATIO;
 return {...project,canvas,sourceCanvas:panoramic?canvas:undefined,export:{...project.export,longEdge:longest}};
}

// Early versions fitted even a lone picture to the empty canvas. Repair only
// its recorded, untouched import pose; other layouts and deliberate edits win.
export function restoreSingleImportFrame(project){
 const [image]=project.images;
 if(project.canvasMode!=='fixed'||project.canvasSizing!=='content'||!project.heightLocked||
    project.images.length!==1||project.layout!=='horizontal'||image.source||image.angle||image.rotation||
    project.edits?.[image.id]||Object.keys(project.layoutStates||{}).some(mode=>mode!=='horizontal'))return project;
 const pose=project.positions?.[image.id],size=project.importSizes?.[image.id],canvas=project.canvas;
 if(!pose||!size||!canvas||pose.x!==0||pose.y!==0||pose.width!==size.width||pose.height!==size.height||pose.height!==canvas.height)return project;
 const legacy=canvas.height===2398;
 const defaultFit=(legacy||canvas.height===DEFAULT_CANVAS.height)&&canvas.width===Math.min(MAX_EDGE,Math.floor(canvas.height*(legacy?MAX_RATIO:FOUR_VIEW_RATIO)),Math.round(pose.width))&&Math.abs(pose.width-canvas.height*image.width/image.height)<1e-7;
 const oversize=project.sourceCanvas&&Math.max(canvas.width,canvas.height)>MAX_EDGE&&canvas.width===image.width&&canvas.height===image.height&&pose.width===image.width;
 if(!defaultFit&&!oversize)return project;
 const frame=fitExportDimensions(image.width,image.height);
 if(canvas.width===frame.width&&canvas.height===frame.height&&pose.width===frame.width)return project;
 const next=setImportFrame(project,frame);
 return recordImportSizes(rememberCanvasLayout({...next,positions:{[image.id]:{x:0,y:0,...frame}}}),[image]);
}

export function importCanvasImages(project,images,{useSourceSize=false}={}){
 if(!images.length)return project;
 if(project.images.length+images.length>100||originalBytes([...project.images,...images])>500*1024*1024)throw new Error('每个项目最多 100 张、500 MB');
 const defaultFrame=project.canvasSizing==='content'&&((project.canvas?.width===DEFAULT_CANVAS.width&&project.canvas?.height===DEFAULT_CANVAS.height)||(project.canvas?.width===5995&&project.canvas?.height===2398));
 const firstFrame=useSourceSize&&defaultFrame&&images.length===1&&!project.images.length&&project.heightLocked
  ?fitExportDimensions(images[0].width,images[0].height):null;
 if(firstFrame)project=setImportFrame(project,firstFrame);
 else if(project.sourceCanvas&&project.canvasSizing==='content'&&project.images.length&&images.some(image=>image.assetId!==project.images[0].assetId)){
  project={...project,sourceCanvas:undefined};
 }
 if(project.heightLocked){
  const next=appendProjectImages(project,images),positions={...next.positions};
  let right=project.images.length?Math.max(...project.images.map(image=>positions[image.id].x+positions[image.id].width)):0;
  for(const image of images){const source=imageGeometry(image,next.edits?.[image.id]),height=project.canvas.height,width=firstFrame?.width??height*source.width/source.height;positions[image.id]={x:right,y:0,width,height};right+=width;}
  return recordImportSizes(fitImportedCanvas(fitHeightCanvas({...next,positions})),images);
 }
 const next=appendProjectImages(project,images);
 return next.canvasMode==='fixed'?recordImportSizes(fitImportedCanvas(next),images):next;
}
