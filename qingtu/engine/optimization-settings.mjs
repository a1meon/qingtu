export const DEFAULT_OPTIMIZATION_SETTINGS=Object.freeze({topPercent:15,sidePixels:100,imageNumber:'auto'});

function cropParameters(value){
 const topPercent=value?.topPercent??DEFAULT_OPTIMIZATION_SETTINGS.topPercent,sidePixels=value?.sidePixels??DEFAULT_OPTIMIZATION_SETTINGS.sidePixels;
 if(!Number.isFinite(topPercent)||topPercent<0||topPercent>=100)throw new Error('顶部裁剪须为 0–100% 之间，且小于 100%');
 if(!Number.isSafeInteger(sidePixels)||sidePixels<0)throw new Error('左右裁剪须为非负整数像素');
 return {topPercent,sidePixels};
}

export function optimizationSettings(value){
 if(value!=null&&(typeof value!=='object'||Array.isArray(value)))throw new Error('优化裁剪设置无效');
 const {topPercent,sidePixels}=cropParameters(value);
 // Older releases serialized the built-in third-image choice on every save.
 const oldDefault=value?.imageNumber===3&&topPercent===15&&sidePixels===100&&!Object.hasOwn(value,'specialCrops');
 const imageNumber=oldDefault||value?.imageNumber===undefined?'auto':value.imageNumber;
 if(imageNumber!==null&&imageNumber!=='auto'&&(!Number.isSafeInteger(imageNumber)||imageNumber<1||imageNumber>100))throw new Error('图片序号须为 1–100，或不选择');
 const settings={topPercent,sidePixels,imageNumber};
 if(Object.hasOwn(value||{},'specialCrops')){
  const crops=value.specialCrops;
  if(!crops||typeof crops!=='object'||Array.isArray(crops)||Object.keys(crops).length>100)throw new Error('图片特殊裁剪设置无效');
  settings.specialCrops=Object.fromEntries(Object.entries(crops).map(([id,crop])=>{
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||!crop||typeof crop!=='object'||Array.isArray(crop)||crop.enabled!==undefined&&typeof crop.enabled!=='boolean')throw new Error('图片特殊裁剪设置无效');
   return [id,{enabled:crop.enabled??true,...cropParameters(crop)}];
  }));
 }
 return settings;
}

// Legacy numbers resolve once when the settings are edited. New records stay
// with the image ID through reordering, and missing/deleted images are ignored.
export function optimizationImageCrops(value,images=[]){
 const settings=optimizationSettings(value);
 if(settings.specialCrops!==undefined)return Object.fromEntries(images.filter(image=>Object.hasOwn(settings.specialCrops,image.id)).map(image=>[image.id,settings.specialCrops[image.id]]));
 const number=settings.imageNumber==='auto'?(images.length===3?2:3):settings.imageNumber;
 const image=number===null?undefined:images[number-1];
 return image?{[image.id]:{enabled:true,topPercent:settings.topPercent,sidePixels:settings.sidePixels}}:{};
}
