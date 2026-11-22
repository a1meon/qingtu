export class PngBudgetError extends Error {
 constructor(losslessBytes,faithfulBytes) {
  const kb=Math.ceil(losslessBytes/1000);
  const advice=kb<=100000
   ? `请提高大小上限（无损导出可设为 ${kb} KB），或选择 JPG`
   : '可选择 JPG 以继续压缩';
  super(`当前尺寸的高保真 PNG 超过大小上限，${advice}。JPG 的透明区域会变为白色。`);
  this.name='PngBudgetError';
  this.losslessBytes=losslessBytes;
  this.faithfulBytes=faithfulBytes;
 }
}
