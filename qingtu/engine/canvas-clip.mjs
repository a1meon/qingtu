// Intersect a raster image with a fixed canvas without changing its transform.
// Source offsets are in the resized image, not in the original file.
export function clipRectangle(rect,canvas){
 const {x,y,width,height}=rect;
 if(![x,y,width,height,canvas.width,canvas.height].every(Number.isSafeInteger)||width<1||height<1||canvas.width<1||canvas.height<1)throw new Error('画布或图片坐标无效');
 const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(canvas.width,x+width),bottom=Math.min(canvas.height,y+height);
 if(right<=left||bottom<=top)return null;
 return {left,top,width:right-left,height:bottom-top,sourceLeft:left-x,sourceTop:top-y};
}
