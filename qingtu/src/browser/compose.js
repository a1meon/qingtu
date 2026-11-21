import {calculateLayout} from '../../engine/stitch-layout.mjs';
import {sourceWindow,imageRotation,imageAngle} from '../../engine/image-source.mjs';
import {rotatedImageBounds} from '../../engine/image-rotation.mjs';
import {readAsset} from '../stitch/database.js';
import {oriented} from './codec.js';

export async function compose(project){
  const layout=calculateLayout(project),canvas=new OffscreenCanvas(layout.width,layout.height);
  const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
  for(const rect of layout.rects){
    const layer=project.images.find(item=>item.id===rect.id),angle=imageAngle(layer),bounds=rotatedImageBounds(rect,angle);
    if(bounds.x+bounds.width<=0||bounds.y+bounds.height<=0||bounds.x>=layout.width||bounds.y>=layout.height)continue;
    const file=await readAsset(rect.assetId);if(!file)throw new Error('原图副本缺失，项目无法恢复');
    const pixels=oriented(new Uint8Array(await file.arrayBuffer()),image=>{
      const turn=imageRotation(layer);if(turn)image.rotate(turn);
      const source=sourceWindow(layer);
      if(image.width!==source.fullWidth||image.height!==source.fullHeight||file.size!==layer.bytes)throw new Error('原图副本与项目尺寸不一致');
      return image.getPixels(p=>new ImageData(new Uint8ClampedArray(p.toByteArray(0,0,image.width,image.height,'RGBA')),image.width,image.height));
    });
    const bitmap=await createImageBitmap(pixels),{left=0,right=0,top=0,bottom=0}=rect.crop||{};
    const x=Math.round(rect.x),y=Math.round(rect.y),w=Math.max(1,Math.round(rect.x+rect.width)-x),h=Math.max(1,Math.round(rect.y+rect.height)-y);
    try{
      ctx.save();ctx.translate(angle?rect.x+rect.width/2:x+w/2,angle?rect.y+rect.height/2:y+h/2);ctx.rotate(angle*Math.PI/180);
      ctx.drawImage(bitmap,left*bitmap.width,top*bitmap.height,(1-left-right)*bitmap.width,(1-top-bottom)*bitmap.height,-w/2,-h/2,w,h);
    }finally{ctx.restore();bitmap.close();}
  }
  return {blob:await canvas.convertToBlob({type:'image/png'}),layout};
}
