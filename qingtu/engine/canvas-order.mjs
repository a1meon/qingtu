import {moveImage} from './stitch-layout.mjs';
import {arrangeImages,arrangeContentImages} from './canvas-fixed.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';

export function reorderCanvas(project,from,to){
 const images=moveImage(project.images,from,to),next={...project,images};
 if(project.layout==='free')return next;
 if(project.heightLocked&&project.layout==='horizontal')return fitHeightCanvas(next);
 return project.canvasSizing==='content'?arrangeContentImages(next):arrangeImages(next);
}
