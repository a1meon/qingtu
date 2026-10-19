import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {loadPreview} from './load-preview.js';

// A small project thumbnail uses only the active canvas's bounded editor images.
// Originals and thumbnails of other projects are never decoded here.
export async function canvasThumbnail(project){
 if(!project.images.length)return null;
 if(project.images.some(image=>!image.preview))return project.thumbnail||null;
 let layout;try{layout=calculateLayout(project,{draft:true});}catch{return null;}
 const scale=160/Math.max(layout.width,layout.height),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(layout.width*scale));canvas.height=Math.max(1,Math.round(layout.height*scale));
 const context=canvas.getContext('2d');
 for(const rect of layout.rects){
  const source=project.images.find(image=>image.id===rect.id),image=await loadPreview(source.preview);
  const crop=rect.crop||{},left=crop.left||0,right=crop.right||0,top=crop.top||0,bottom=crop.bottom||0;
  context.save();context.translate((rect.x+rect.width/2)*scale,(rect.y+rect.height/2)*scale);context.rotate((source.angle||0)*Math.PI/180);
  context.drawImage(image,image.naturalWidth*left,image.naturalHeight*top,image.naturalWidth*(1-left-right),image.naturalHeight*(1-top-bottom),-rect.width*scale/2,-rect.height*scale/2,rect.width*scale,rect.height*scale);context.restore();
 }
 return canvas.toDataURL('image/png');
}
