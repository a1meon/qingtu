import {appendProjectImages} from './stitch-reset.mjs';
import {fitImportedCanvas} from './canvas-layout-state.mjs';

export function importCanvasImages(project,images){
 if(!images.length)return project;
 const next=appendProjectImages(project,images);
 return next.canvasMode==='fixed'?fitImportedCanvas(next):next;
}
