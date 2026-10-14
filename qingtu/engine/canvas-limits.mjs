export const MAX_EDGE=5999,MAX_RATIO=2.5;
export const DEFAULT_CANVAS=Object.freeze({width:5995,height:2398});
export function validateCanvas(width,height){
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=MAX_EDGE))throw new Error('画布宽高须为 1–5999 像素');
 if(Math.max(width,height)/Math.min(width,height)>MAX_RATIO)throw new Error('画布比例超过 2.5，请调整宽高');
 return {width,height};
}
