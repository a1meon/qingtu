export const CONTROL_PANEL_HEIGHT={crop:116,split:130};

// Reserve only the controls that are actually visible. This is display space,
// independent of the project's saved canvas and export pixel dimensions.
export function fitCanvasViewport(bounds,layout,{hasImages=false,editor=null}={}){
 const top=hasImages?52:16,bottom=hasImages&&editor?CONTROL_PANEL_HEIGHT[editor]+18:16;
 const scale=Math.max(.000001,Math.min(Math.max(1,bounds.width-32)/layout.width,Math.max(1,bounds.height-top-bottom)/layout.height));
 return {scale,offsetY:(top-bottom)/2};
}
