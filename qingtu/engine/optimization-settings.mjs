export const DEFAULT_OPTIMIZATION_SETTINGS=Object.freeze({topPercent:25,sidePixels:100});

export function optimizationSettings(value){
 if(value!=null&&(typeof value!=='object'||Array.isArray(value)))throw new Error('优化裁剪设置无效');
 const topPercent=value?.topPercent??DEFAULT_OPTIMIZATION_SETTINGS.topPercent,sidePixels=value?.sidePixels??DEFAULT_OPTIMIZATION_SETTINGS.sidePixels;
 if(!Number.isFinite(topPercent)||topPercent<0||topPercent>=100)throw new Error('顶部裁剪须为 0–100% 之间，且小于 100%');
 if(!Number.isSafeInteger(sidePixels)||sidePixels<0)throw new Error('左右裁剪须为非负整数像素');
 return {topPercent,sidePixels};
}
