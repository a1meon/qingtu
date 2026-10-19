import {rotatedImageBounds} from '../../engine/image-rotation.mjs';
// Keep display fitting independent of the currently open floating editor.
export function fitCanvasViewport(bounds,layout,{hasImages=false,includeImages=false,maxScale=Infinity}={}){
 const top=hasImages?52:16,bottom=16;
 const rects=includeImages?(layout.rects||[]).map(rect=>rotatedImageBounds(rect,rect.angle||0)):[],left=Math.min(0,...rects.map(rect=>rect.x)),upper=Math.min(0,...rects.map(rect=>rect.y)),right=Math.max(layout.width,...rects.map(rect=>rect.x+rect.width)),lower=Math.max(layout.height,...rects.map(rect=>rect.y+rect.height));
 const scale=Math.max(Number.MIN_VALUE,Math.min(maxScale,Math.max(1,bounds.width-32)/Math.max(layout.width,layout.width-2*left,2*right-layout.width),Math.max(1,bounds.height-top-bottom)/Math.max(layout.height,layout.height-2*upper,2*lower-layout.height)));
 return {scale,offsetX:0,offsetY:(top-bottom)/2};
}

export function hasOffscreenImages(bounds,layout,view){
 const left=(bounds.width-layout.width*view.scale)/2+(view.offsetX||0),top=(bounds.height-layout.height*view.scale)/2+view.offsetY;
 return (layout.rects||[]).map(rect=>rotatedImageBounds(rect,rect.angle||0)).some(rect=>{
  const x=left+rect.x*view.scale,y=top+rect.y*view.scale,right=x+rect.width*view.scale,bottom=y+rect.height*view.scale;
  return right<=8||x>=bounds.width-8||bottom<=8||y>=bounds.height-8;
 });
}

// Responsive breakpoints can release side-panel space while the window shrinks.
// Keep the previous scale ceiling through those resize/transition callbacks.
// Inspector state changes (automatic or manual) and explicit view changes use a fresh key.
export function resizeCanvasViewport(previous,{key,width,height,scale}){
 let maxScale=Infinity;
 if(previous?.key===key&&width<=previous.width&&height<=previous.height){
  maxScale=previous.maxScale??Infinity;
  if(width<previous.width||height<previous.height)maxScale=Math.min(maxScale,previous.scale);
 }
 return {key,width,height,maxScale,scale:Math.min(scale,maxScale)};
}

// Both tool rows follow the image without clamping to the display area.
export function placeImageControls(bounds,rect,mode='crop'){
 const rotation=mode==='rotate',panelWidth=rotation?220:300;
 return {tools:{left:rect.x+(rect.width-154)/2,top:rect.y-(rotation?59:43)},panel:{left:rect.x+(rect.width-panelWidth)/2,top:rect.y+rect.height+(rotation?18:10),width:panelWidth}};
}

export function zoomCanvasCamera(camera,factor){
 return {zoom:Math.max(.1,Math.min(8,camera.zoom*factor)),x:0,y:0};
}
export function applyCanvasCamera(fit,camera){
 return {scale:fit.scale*camera.zoom,offsetX:fit.offsetX,offsetY:fit.offsetY};
}
