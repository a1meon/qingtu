import {fitExportDimensions} from './canvas-limits.mjs';

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
      if (resize.anchor === 'height') width = Math.max(1,Math.round(height * meta.width / meta.height));
      else height = Math.max(1,Math.round(width * meta.height / meta.width));
    }
  }
  return fitExportDimensions(width,height);
}
