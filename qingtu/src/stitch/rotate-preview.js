import {loadPreview} from './load-preview.js';
import {imageRotation} from '../../engine/image-source.mjs';

// Quarter turns only permute the bounded preview pixels. Keep transposed
// bounds rather than repeatedly resampling a source on successive turns.
export async function rotatePreview(url,degrees,mirrored=false){
 const angle=((degrees%360)+360)%360;imageRotation({rotation:angle});if(!angle&&!mirrored)return url;
 const image=await loadPreview(url),canvas=document.createElement('canvas'),swap=angle%180!==0;
 canvas.width=swap?image.naturalHeight:image.naturalWidth;canvas.height=swap?image.naturalWidth:image.naturalHeight;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;context.translate(canvas.width/2,canvas.height/2);context.rotate(angle*Math.PI/180);
 if(mirrored)context.scale(-1,1);
 context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
 return canvas.toDataURL('image/png');
}
