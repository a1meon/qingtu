// Keep display fitting independent of the currently open floating editor.
export function fitCanvasViewport(bounds,layout,{hasImages=false,maxScale=Infinity}={}){
 // The 22px corner handles need 12px at each edge to remain fully clickable.
 const verticalInset=hasImages?12:16;
 const scale=Math.max(Number.MIN_VALUE,Math.min(maxScale,Math.max(1,bounds.width-32)/layout.width,Math.max(1,bounds.height-2*verticalInset)/layout.height));
 return {scale,offsetX:0,offsetY:0};
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

export const imageToolbarWidth=154;

// The image and the visible editor bounds use the same CSS pixel coordinates.
export function placeImageControls(bounds,rect,mode='crop'){
 const rotation=mode==='rotate',panelWidth=rotation?220:300,centerX=rect.x+rect.width/2;
 const toolbarWidth=imageToolbarWidth,toolbarHeight=39,left=bounds.left??0,top=bounds.top??0;
 const dockedTop=bounds.toolbarFloor??top-toolbarHeight-4;
 const toolsTop=Math.max(dockedTop,Math.min(rect.y-(rotation?59:43),top+bounds.height-toolbarHeight));
 return {
  tools:{
   left:Math.max(left,Math.min(centerX-toolbarWidth/2,left+bounds.width-toolbarWidth)),
   top:toolsTop,
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
 const zoom=Math.max(.1,Math.min(8,camera.zoom*factor)),ratio=zoom/camera.zoom;
 return {zoom,x:camera.x*ratio,y:camera.y*ratio};
}

// Coordinates are relative to the fitted canvas centre. A selected layer can
// extend beyond a single edge after a resize, move, or rotation.
export function canvasPanContent(layout,selection,scale){
 const width=layout?.width||0,height=layout?.height||0;
 const left=Math.min(0,selection?.x??0),right=Math.max(width,selection?selection.x+selection.width:0);
 const top=Math.min(0,selection?.y??0),bottom=Math.max(height,selection?selection.y+selection.height:0);
 return {width:(right-left)*scale,height:(bottom-top)*scale,centerX:(left+right-width)*scale/2,centerY:(top+bottom-height)*scale/2};
}

export function panLimits(zoom,viewport,content){
 const x=(content.width*zoom-viewport.width)/2,y=(content.height*zoom-viewport.height)/2;
 const cx=(content.centerX||0)*zoom,cy=(content.centerY||0)*zoom;
 return {minX:Math.min(0,-x-cx),maxX:Math.max(0,x-cx),minY:Math.min(0,-y-cy),maxY:Math.max(0,y-cy)};
}

export function constrainCamera(camera,viewport,content){
 const {minX,maxX,minY,maxY}=panLimits(camera.zoom,viewport,content);
 return {...camera,x:Math.min(maxX,Math.max(minX,camera.x))||0,y:Math.min(maxY,Math.max(minY,camera.y))||0};
}

export function stepCanvasZoom(zoom,direction){
 return Math.max(.1,Math.min(8,zoom+direction*.25));
}

const maxWheelExponent=Math.log(1.14);
export function wheelZoomFactor(deltaY,deltaMode,pageHeight){
 const unit=deltaMode===1?16:deltaMode===2?pageHeight:1;
 // Pixel-mode pinch deltas encode -100 * ln(scale). Cap a single large mouse-wheel tick.
 const exponent=-deltaY*unit/100;
 return Math.exp(Math.max(-maxWheelExponent,Math.min(maxWheelExponent,exponent)));
}

export function applyCanvasCamera(fit,camera){
 return {scale:fit.scale*camera.zoom,offsetX:fit.offsetX+camera.x,offsetY:fit.offsetY+camera.y};
}
