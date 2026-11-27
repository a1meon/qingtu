import {rotateVector} from '../../engine/image-rotation.mjs';

export function layerPoint(event, board, rect, scale, angle){
 const box=board.getBoundingClientRect();
 const point=rotateVector((event.clientX-box.left)/scale-rect.x-rect.width/2,
   (event.clientY-box.top)/scale-rect.y-rect.height/2,-angle);
 const {left=0,right=0,top=0,bottom=0}=rect.crop||{};
 return {x:left+(point.x/rect.width+.5)*(1-left-right),y:top+(point.y/rect.height+.5)*(1-top-bottom)};
}

let sample;
export function sampleCanvasPixel(layer,{x,y}){
 const pixels=layer?.querySelector('canvas:not([hidden]), img:not([hidden])');
 const width=pixels?.naturalWidth??pixels?.width,height=pixels?.naturalHeight??pixels?.height;
 if(!width||!height)return null;
 const px=Math.min(width-1,Math.max(0,Math.floor(x*width)));
 const py=Math.min(height-1,Math.max(0,Math.floor(y*height)));
 if(pixels.tagName==='CANVAS')return pixels.getContext('2d').getImageData(px,py,1,1).data;
 if(!sample){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=1;sample=canvas.getContext('2d',{willReadFrequently:true});
 }
 sample.clearRect(0,0,1,1);
 sample.drawImage(pixels,px,py,1,1,0,0,1,1);
 return sample.getImageData(0,0,1,1).data;
}
