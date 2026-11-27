import {moveImage} from './stitch-layout.mjs';
import {arrangeImages,arrangeContentImages,gridRows} from './canvas-fixed.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';

// A remembered layout can have a different visual order from the last layout edited.
function imagesInSlots(project){
 const images=[...project.images],positions=project.positions;
 const byColumn=(a,b)=>positions[a.id].x-positions[b.id].x;
 const centerY=image=>positions[image.id].y+positions[image.id].height/2;
 const byRow=(a,b)=>centerY(a)-centerY(b);
 if(project.layout==='horizontal')return images.sort(byColumn);
 images.sort(byRow);
 return project.layout==='grid'?gridRows(images,project.grid).flatMap(row=>row.sort(byColumn)):images;
}

export function reorderCanvas(project,from,to){
 if(project.layout==='free')return {...project,images:moveImage(project.images,from,to)};
 const images=imagesInSlots(project);
 const sourceIndex=images.findIndex(image=>image.id===from),targetIndex=images.findIndex(image=>image.id===to);
 if(sourceIndex<0||targetIndex<0||sourceIndex===targetIndex)return project;
 [images[sourceIndex],images[targetIndex]]=[images[targetIndex],images[sourceIndex]];
 const next={...project,images};
 if(project.heightLocked&&project.layout==='horizontal')return fitHeightCanvas(next);
 return project.canvasSizing==='content'?arrangeContentImages(next):arrangeImages(next);
}
