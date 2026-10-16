// Thumbnail drawing needs a loaded raster, not compositor scheduling. Chromium
// can leave decode() pending for an already drawable image in an occluded window.
export function loadPreview(url){
 return new Promise((resolve,reject)=>{
  const image=new Image();
  const finish=error=>{clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve(image);};
  const loaded=()=>finish(image.naturalWidth>0&&image.naturalHeight>0?null:new Error('图片预览加载失败'));
  const timer=setTimeout(()=>finish(new Error('图片预览加载超时，请重试')),10000);
  image.onload=loaded;image.onerror=()=>finish(new Error('图片预览加载失败'));image.src=url;
  if(image.complete)loaded();
 });
}
