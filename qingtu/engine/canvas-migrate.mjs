import {calculateLayout} from './stitch-layout.mjs';
import {DEFAULT_CANVAS,validateCanvas} from './canvas-limits.mjs';
import {appendFixedImages} from './canvas-fixed.mjs';

// Legacy canvas was a derived cache, so only canvasMode marks the new schema.
// Rebuild its last layout once, retaining original bytes, order and edit state.
export function migrateFixedCanvas(project){
 if(project.canvasMode==='fixed')return project;
 const next={...project,canvasMode:'fixed',canvas:{...DEFAULT_CANVAS},positions:{},edits:{...project.edits}};
 if(!project.images.length)return next;
 let layout;try{layout=calculateLayout(project);}catch{try{layout=calculateLayout(project,{draft:true});}catch{
  // A legacy invalid grid/missing pose has no recoverable layout raster. Keep
  // every source/edit and expose its controls rather than making it unopenable.
  next.positions=appendFixedImages({...next,images:[]},project.images).positions;return next;
 }}
 try{next.canvas=validateCanvas(layout.width,layout.height);}catch{/* Invalid legacy bounds retain all editable poses in the default fixed canvas. */}
 for(const rect of layout.rects){
  next.positions[rect.id]={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  if(rect.autoCrop){
   const image=project.images.find(image=>image.id===rect.id),fullWidth=Math.round(image.width/image.height*rect.height);
   next.edits[rect.id]={axis:'horizontal',fraction:(1-rect.width/fullWidth)/2};
  }
 }
 return next;
}
