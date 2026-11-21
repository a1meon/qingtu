export function dimensions(meta, resize = {type:'scale',percent:100}) {
  let width, height;
  if (resize.type === 'scale') {
    const percent = Number(resize.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 400) throw new Error('缩放比例须为 0.1–400%');
    width = Math.max(1, Math.round(meta.width * percent / 100));
    height = Math.max(1, Math.round(meta.height * percent / 100));
  } else {
    width = Number(resize.width); height = Number(resize.height);
    if (resize.locked) {
      if (resize.anchor === 'height') width = Math.round(height * meta.width / meta.height);
      else height = Math.round(width * meta.height / meta.width);
    }
  }
  if (![width,height].every(v => Number.isInteger(v) && v > 0 && v <= 16384) || width * height > 100_000_000) throw new Error('尺寸须为 1–16384 像素，且总像素不超过 1 亿');
  return {width,height};
}

// Resize the whole original raster, never its last candidate. Integer rounding
// changes either edge by at most one pixel; strict 5:2 canvases stay exact.
export function pngBudgetDimensions(info,longEdge,{maxRatio}={}){
 const horizontal=info.width>=info.height,originalLong=Math.max(info.width,info.height);
 const strict=info.width*2===info.height*5||info.height*2===info.width*5;
 const unit=strict?5:1;
 longEdge=Math.max(unit,Math.min(originalLong,Math.floor(longEdge/unit)*unit));
 let shortEdge=Math.max(1,Math.round(longEdge*Math.min(info.width,info.height)/originalLong));
 if(strict)shortEdge=longEdge/5*2;
 else if(maxRatio&&longEdge/shortEdge>maxRatio)shortEdge=Math.ceil(longEdge/maxRatio);
 return horizontal?{width:longEdge,height:shortEdge}:{width:shortEdge,height:longEdge};
}
