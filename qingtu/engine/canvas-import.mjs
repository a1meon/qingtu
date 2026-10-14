import {appendProjectImages} from './stitch-reset.mjs';
import {fitImportedCanvas} from './canvas-layout-state.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';
import {imageGeometry} from './stitch-edits.mjs';

export function importCanvasImages(project,images){
 if(!images.length)return project;
 if(project.heightLocked){
  const next=appendProjectImages(project,images),positions={...next.positions};
  let right=project.images.length?Math.max(...project.images.map(image=>positions[image.id].x+positions[image.id].width)):0;
  for(const image of images){const source=imageGeometry(image,next.edits?.[image.id]),height=project.canvas.height,width=height*source.width/source.height;positions[image.id]={x:right,y:0,width,height};right+=width;}
  return fitImportedCanvas(fitHeightCanvas({...next,positions,canvasSizing:'content'}));
 }
 const next=appendProjectImages(project,images);
 return next.canvasMode==='fixed'?fitImportedCanvas(next):next;
}
