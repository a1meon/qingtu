export const CONTROL_PANEL_HEIGHT={crop:116,split:130};

// Reserve only the controls that are actually visible. This is display space,
// independent of the project's saved canvas and export pixel dimensions.
export function fitCanvasViewport(bounds,layout,{hasImages=false,editor=null,includeImages=false}={}){
 const top=hasImages?52:16,bottom=hasImages&&editor?CONTROL_PANEL_HEIGHT[editor]+18:16;
 const rects=includeImages?layout.rects||[]:[],left=Math.min(0,...rects.map(rect=>rect.x)),upper=Math.min(0,...rects.map(rect=>rect.y)),right=Math.max(layout.width,...rects.map(rect=>rect.x+rect.width)),lower=Math.max(layout.height,...rects.map(rect=>rect.y+rect.height));
 const scale=Math.max(Number.MIN_VALUE,Math.min(Math.max(1,bounds.width-32)/(right-left),Math.max(1,bounds.height-top-bottom)/(lower-upper)));
 return {scale,offsetX:(layout.width-left-right)*scale/2,offsetY:(top-bottom)/2+(layout.height-upper-lower)*scale/2};
}

export function hasOffscreenImages(bounds,layout,view){
 const left=(bounds.width-layout.width*view.scale)/2+(view.offsetX||0),top=(bounds.height-layout.height*view.scale)/2+view.offsetY;
 return (layout.rects||[]).some(rect=>{
  const x=left+rect.x*view.scale,y=top+rect.y*view.scale,right=x+rect.width*view.scale,bottom=y+rect.height*view.scale;
  return right<=8||x>=bounds.width-8||bottom<=8||y>=bounds.height-8;
 });
}
