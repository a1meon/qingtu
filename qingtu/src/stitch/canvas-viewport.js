import {rotatedImageBounds} from '../../engine/image-rotation.mjs';
// Keep display fitting independent of the currently open floating editor.
export function fitCanvasViewport(bounds,layout,{hasImages=false,includeImages=false,maxScale=Infinity}={}){
 // The image toolbar starts 43px above its image. Balance that clearance at both edges.
 const verticalInset=hasImages?44:16;
 const rects=includeImages?(layout.rects||[]).map(rect=>rotatedImageBounds(rect,rect.angle||0)):[],left=Math.min(0,...rects.map(rect=>rect.x)),upper=Math.min(0,...rects.map(rect=>rect.y)),right=Math.max(layout.width,...rects.map(rect=>rect.x+rect.width)),lower=Math.max(layout.height,...rects.map(rect=>rect.y+rect.height));
 const scale=Math.max(Number.MIN_VALUE,Math.min(maxScale,Math.max(1,bounds.width-32)/Math.max(layout.width,layout.width-2*left,2*right-layout.width),Math.max(1,bounds.height-2*verticalInset)/Math.max(layout.height,layout.height-2*upper,2*lower-layout.height)));
 return {scale,offsetX:0,offsetY:0};
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

// The image and the visible editor bounds use the same CSS pixel coordinates.
export function placeImageControls(bounds,rect,mode='crop'){
 const rotation=mode==='rotate',panelWidth=rotation?220:300,centerX=rect.x+rect.width/2;
 const toolbarWidth=154,toolbarHeight=39,left=bounds.left??0,top=bounds.top??0;
 const dockedTop=top-toolbarHeight-4;
 return {
  tools:{
   left:Math.max(left,Math.min(centerX-toolbarWidth/2,left+bounds.width-toolbarWidth)),
   top:Math.max(dockedTop,Math.min(rect.y-(rotation?59:43),top+bounds.height-toolbarHeight)),
  },
  panel:{left:centerX-panelWidth/2,top:rect.y+rect.height+(rotation?18:10),width:panelWidth},
 };
}

// Follow the image until its lower edge leaves the display. Keep the complete
// card in the window and leave the zoom controls accessible in narrow layouts.
export function placeImagePanel(bounds,anchor,height){
 const gap=4,width=Math.min(anchor.width,bounds.width);
 const leftEdge=bounds.left,topEdge=bounds.top,displayBottom=topEdge+bounds.height;
 const lastTop=bounds.windowHeight-gap-height;
 let left=Math.max(leftEdge,Math.min(anchor.left+(anchor.width-width)/2,leftEdge+bounds.width-width));
 let top=Math.max(gap,Math.min(lastTop,Math.max(topEdge+gap,Math.min(anchor.top,displayBottom+gap))));
 const nav=bounds.navigation;
 if(nav&&left+width>nav.left-gap&&left<nav.right+gap&&top+height>nav.top-gap&&top<nav.bottom+gap){
  if(nav.left-gap-width>=leftEdge)left=nav.left-gap-width;
  else {
   const above=nav.top-gap-height,below=nav.bottom+gap;
   const preferBelow=above<topEdge||below-top<=top-above;
   top=preferBelow&&below<=lastTop?below:Math.max(gap,above);
  }
 }
 return {left,top,width};
}

export function zoomCanvasCamera(camera,factor){
 return {zoom:Math.max(.1,Math.min(8,camera.zoom*factor)),x:0,y:0};
}

export function stepCanvasZoom(zoom,direction){
 return Math.max(.1,Math.min(8,zoom+direction*.25));
}

const maxWheelExponent=Math.log(1.6);
export function wheelZoomFactor(deltaY,deltaMode,pageHeight){
 const unit=deltaMode===1?16:deltaMode===2?pageHeight:1;
 // Pixel-mode pinch deltas encode -100 * ln(scale). Cap a single large mouse-wheel tick.
 const exponent=-deltaY*unit/100;
 return Math.exp(Math.max(-maxWheelExponent,Math.min(maxWheelExponent,exponent)));
}

export function applyCanvasCamera(fit,camera){
 return {scale:fit.scale*camera.zoom,offsetX:fit.offsetX,offsetY:fit.offsetY};
}
