// Split images share one immutable copied asset. Width/height describe this
// piece; source describes its exact oriented pixel window in that asset.
export function imageRotation(image){
 const angle=image.rotation??0;if(![0,90,180,270].includes(angle))throw new Error('图片旋转角度无效');return angle;
}
export function imageAngle(image){
 const angle=image.angle??0;if(!Number.isFinite(angle)||angle < -180||angle>=180)throw new Error('图片旋转角度无效');return angle;
}
export function imageMirrored(image){
 const value=image.mirrored??false;if(typeof value!=='boolean')throw new Error('图片镜像参数无效');return value;
}
export function sourceWindow(image){
 imageRotation(image);imageAngle(image);imageMirrored(image);
 const source=image.source??{left:0,top:0,width:image.width,height:image.height,fullWidth:image.width,fullHeight:image.height};
 if(![source.left,source.top,source.width,source.height,source.fullWidth,source.fullHeight].every(Number.isSafeInteger)||source.left<0||source.top<0||source.width<1||source.height<1||source.width!==image.width||source.height!==image.height||source.left+source.width>source.fullWidth||source.top+source.height>source.fullHeight||source.fullWidth*source.fullHeight>100000000)throw new Error('拆分原图区域无效');
 return source;
}
export function originalBytes(images){
 const assets=new Map();for(const image of images)assets.set(image.assetId,Math.max(assets.get(image.assetId)||0,image.bytes));
 return [...assets.values()].reduce((sum,bytes)=>sum+bytes,0);
}
