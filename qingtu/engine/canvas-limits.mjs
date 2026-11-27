export const MAX_EDGE=5999,MAX_RATIO=2.5;
export const FOUR_VIEW_RATIO=12/5;
const presetScale=Math.floor(MAX_EDGE/12);
export const DEFAULT_CANVAS=Object.freeze({width:12*presetScale,height:5*presetScale});

export function fitExportDimensions(width,height){
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0))throw new Error('尺寸须为正整数像素');
 const longest=Math.max(width,height);
 if(longest<=MAX_EDGE)return {width,height};
 return {width:Math.max(1,Math.round(width*MAX_EDGE/longest)),height:Math.max(1,Math.round(height*MAX_EDGE/longest))};
}

export function canvasRatioLimit(source){
 if(!source)return MAX_RATIO;
 const {width,height}=source;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||width*height>100000000)throw new Error('原图尺寸无效');
 return Math.max(MAX_RATIO,width/height,height/width);
}

export function validateCanvas(width,height,source){
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=MAX_EDGE))throw new Error('画布宽高须为 1–5999 像素');
 const ratio=canvasRatioLimit(source);
 if(Math.max(width,height)/Math.min(width,height)>ratio)throw new Error(`画布比例超过 ${ratio}，请调整宽高`);
 return {width,height};
}
