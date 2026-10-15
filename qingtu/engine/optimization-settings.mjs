export const DEFAULT_OPTIMIZATION_SETTINGS=Object.freeze({topPercent:15,sidePixels:100,imageNumber:3});

export function optimizationSettings(value){
 if(value!=null&&(typeof value!=='object'||Array.isArray(value)))throw new Error('优化裁剪设置无效');
 const topPercent=value?.topPercent??DEFAULT_OPTIMIZATION_SETTINGS.topPercent,sidePixels=value?.sidePixels??DEFAULT_OPTIMIZATION_SETTINGS.sidePixels;
 const imageNumber=value?.imageNumber===undefined?DEFAULT_OPTIMIZATION_SETTINGS.imageNumber:value.imageNumber;
 if(imageNumber!==null&&(!Number.isSafeInteger(imageNumber)||imageNumber<1||imageNumber>100))throw new Error('图片序号须为 1–100，或不选择');
 if(!Number.isFinite(topPercent)||topPercent<0||topPercent>=100)throw new Error('顶部裁剪须为 0–100% 之间，且小于 100%');
 if(!Number.isSafeInteger(sidePixels)||sidePixels<0)throw new Error('左右裁剪须为非负整数像素');
 return {topPercent,sidePixels,imageNumber};
}
