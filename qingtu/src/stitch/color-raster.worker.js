import {createInteractiveGrade} from './interactive-grade.js';
import {hasAdvancedColor,hasSampledHsl} from '../../engine/advanced-color.mjs';
import {paintColorPreview} from './color-preview.js';
import {applyPortraitRetouch,hasPortraitRetouch} from '../../engine/portrait-retouch.mjs';
import {applyImageColor} from '../../engine/image-color.mjs';

let source,compositor,accelerate;

self.onmessage = ({data: {image, color, maxEdge, crop,interactive}}) => {
  try {
    if(image){
      const canvas = new OffscreenCanvas(1, 1);
      source={pixels:paintColorPreview(canvas,image,null,maxEdge,crop),width:canvas.width,height:canvas.height};
    }
    const {pixels:original,width,height}=source;
    const frame={width,height,crop,retouchApplied:true};
    const portrait=color?.retouch;
    let base;
    if(interactive==='liquify'&&portrait?.strokes?.length){
      const strokes=portrait.strokes,prior={...portrait,strokes:strokes.slice(0,-1)};
      const key=JSON.stringify(prior);
      if(source.brushKey!==key){
        source.brushKey=key;
        source.brushBase=hasPortraitRetouch(prior)?applyPortraitRetouch(original.slice(),prior,frame):original;
      }
      base=applyPortraitRetouch(source.brushBase.slice(),{turn:portrait.turn,mirrored:portrait.mirrored,strokes:[strokes.at(-1)]},frame);
    }else{
      const retouch=JSON.stringify(portrait);
      if(source.retouch!==retouch){
        source.retouch=retouch;
        source.warped=hasPortraitRetouch(portrait)?applyPortraitRetouch(original.slice(),portrait,frame):null;
      }
      base=source.warped||original;
    }
    if(interactive&&interactive!=='liquify'&&accelerate!==false&&!hasAdvancedColor(color)&&!hasSampledHsl(color)){
      try{
        accelerate??=createInteractiveGrade();
        const bitmap=accelerate(base,color,width,height,crop);
        self.postMessage({bitmap},[bitmap]);return;
      }catch{accelerate=false;}
    }
    const pixels=applyImageColor(base.slice(),color,frame);
    if(interactive){
      if(compositor?.width!==width||compositor?.height!==height)compositor=new OffscreenCanvas(width,height);
      compositor.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
      const bitmap=compositor.transferToImageBitmap();self.postMessage({bitmap},[bitmap]);
    }else self.postMessage({pixels,width,height},[pixels.buffer]);
  } catch (error) {
    self.postMessage({error: error.message});
  } finally {
    image?.close();
  }
};
