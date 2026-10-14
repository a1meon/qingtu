export const RESIZE_HANDLES=['nw','n','ne','e','se','s','sw','w'];

// Keep the opposite edge/corner still. Shift permits independent dimensions;
// otherwise preserve the image's current aspect, including a prior Shift edit.
export function resizeImageRect(rect,handle,dx,dy,shift=false){
 if(!RESIZE_HANDLES.includes(handle)||![rect.x,rect.y,rect.width,rect.height,dx,dy].every(Number.isFinite)||rect.width<=0||rect.height<=0)throw new Error('图片缩放参数无效');
 const horizontal=handle.includes('e')?1:handle.includes('w')?-1:0;
 const vertical=handle.includes('s')?1:handle.includes('n')?-1:0;
 let width=rect.width,height=rect.height;
 if(shift){
  if(horizontal)width=Math.max(1,width+dx*horizontal);
  if(vertical)height=Math.max(1,height+dy*vertical);
 }else{
  const sx=horizontal?dx*horizontal/width:0,sy=vertical?dy*vertical/height:0;
  const delta=!horizontal?sy:!vertical?sx:Math.abs(sx)>=Math.abs(sy)?sx:sy;
  const factor=Math.max(1/Math.min(width,height),1+delta);
  width*=factor;height*=factor;
 }
 return {...rect,x:rect.x+(horizontal<0?rect.width-width:horizontal===0?(rect.width-width)/2:0),y:rect.y+(vertical<0?rect.height-height:vertical===0?(rect.height-height)/2:0),width,height};
}
