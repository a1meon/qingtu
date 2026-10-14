// Integer dimensions preserve the exact ratio, including the 5:2 default.
const definitions=[['5:2','2.5:1',5,2],['21:9','21:9',7,3],['16:9','16:9',16,9],['4:3','4:3',4,3],['1:1','1:1',1,1]];
export const CANVAS_PRESETS=definitions.map(([value,label,w,h])=>{const scale=Math.floor(5999/Math.max(w,h));return {value,label,width:w*scale,height:h*scale};});
export function canvasPresetValue(canvas){return CANVAS_PRESETS.find(p=>canvas?.width*p.height===canvas?.height*p.width)?.value||'custom';}
export function presetCanvas(value){const preset=CANVAS_PRESETS.find(p=>p.value===value);if(!preset)throw new Error('画布预设无效');return {width:preset.width,height:preset.height};}
