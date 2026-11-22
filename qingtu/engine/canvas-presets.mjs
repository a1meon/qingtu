import {MAX_EDGE,MAX_RATIO,FOUR_VIEW_RATIO,fitExportDimensions,canvasRatioLimit} from './canvas-limits.mjs';
import {dimensions} from './image-dimensions.mjs';
import {imageRotation} from './image-source.mjs';
import {fitImagesToPreset} from './canvas-fixed.mjs';

// Integer dimensions preserve the exact ratio, including the 12:5 default.
const definitions=[['12:5','2.4:1',12,5],['21:9','21:9',7,3],['16:9','16:9',16,9],['4:3','4:3',4,3],['1:1','1:1',1,1]];
export const CANVAS_PRESETS=definitions.map(([value,label,w,h])=>{const scale=Math.floor(MAX_EDGE/Math.max(w,h));return {value,label,width:w*scale,height:h*scale};});
export function canvasPresetValue(canvas){return CANVAS_PRESETS.find(p=>canvas?.width*p.height===canvas?.height*p.width)?.value||'custom';}
export function presetCanvas(value){const preset=CANVAS_PRESETS.find(p=>p.value===value);if(!preset)throw new Error('画布预设无效');return {width:preset.width,height:preset.height};}

const sameSize=(a,b)=>!!a&&!!b&&a.width===b.width&&a.height===b.height;
const aspectRatio=({width,height})=>Math.max(width/height,height/width);
const validFrame=(frame,limit)=>frame&&[frame.width,frame.height].every(n=>Number.isInteger(n)&&n>0&&n<=MAX_EDGE)&&aspectRatio(frame)<=limit;

export function originalCanvas(project){
 const originals=new Map();
 for(const image of project?.images||[]){
  // Imports have independent layer IDs even when their bytes are identical.
  // Split windows share a root; older windows only recorded the source asset.
  const root=image.splitOrigin;
  const id=root?.id??(image.source?'asset:'+image.assetId:image.id);
  if(originals.has(id))continue;
  const width=root?.width??image.source?.fullWidth??image.width;
  const height=root?.height??image.source?.fullHeight??image.height;
  const turned=imageRotation(root||image)%180!==0;
  const size=root?.size??(image.source?undefined:project.importSizes?.[image.id]);
  originals.set(id,{width:turned?height:width,height:turned?width:height,importHeight:turned?size?.width:size?.height});
 }
 const frames=[...originals.values()];
 if(!frames.length)return null;
 if(frames.length===1)return fitExportDimensions(frames[0].width,frames[0].height);
 const ratio=frames.reduce((sum,frame)=>sum+frame.width/frame.height,0);
 const importHeight=Math.max(...frames.map(frame=>frame.importHeight??frame.height));
 const height=Math.min(importHeight,MAX_EDGE,MAX_EDGE/ratio);
 return {width:Math.max(1,Math.round(height*ratio)),height:Math.max(1,Math.round(height))};
}

export function currentCanvasPreset(project,canvas=project?.canvas){
 const choice=project?.canvasControls?.preset;
 if(choice==='custom'&&project.canvasSizing==='manual')return 'custom';
 if(choice&&CANVAS_PRESETS.some(p=>p.value===choice&&sameSize(p,canvas)))return choice;
 if(sameSize(originalCanvas(project),canvas))return 'original';
 return canvasPresetValue(canvas);
}

function withCanvas(project,canvas,controls){
 return {...project,canvas,canvasSizing:'manual',canvasControls:controls,
  export:{...project.export,longEdge:Math.max(canvas.width,canvas.height)}};
}

export function selectCanvasPreset(project,value){
 const controls=project.canvasControls||{},original=originalCanvas(project);
 const custom=controls.custom??(validFrame(project.canvas,canvasRatioLimit(project.sourceCanvas))?project.canvas:original);
 let canvas;
 if(value==='original')canvas=original;
 else if(value==='custom')canvas=custom;
 else canvas=presetCanvas(value);
 if(!canvas)return project;
 const next=withCanvas(project,canvas,{...controls,preset:value,custom,reference:canvas});
 if(value==='original'&&aspectRatio(canvas)>MAX_RATIO)next.sourceCanvas=canvas;
 return fitImagesToPreset(next,{contain:value==='original'});
}

export function toggleCanvasRatio(project){
 const controls=project.canvasControls||{};
 return {...project,canvasControls:{...controls,locked:controls.locked===false,reference:project.canvas}};
}

export function editCanvasDimension(project,field,value){
 const controls=project.canvasControls||{},locked=controls.locked!==false;
 // Keep a stable ratio while entering digits. Deriving it from rounded pixels
 // on every keystroke would change the ratio, especially in small canvases.
 const previous=project.canvas;
 const reference=controls.preset==='custom'&&project.canvasSizing==='manual'&&controls.reference?.width>0&&controls.reference.height>0
  ?controls.reference:previous;
 const pixels=Math.min(MAX_EDGE,Number(value));
 const limit=locked&&reference.width===reference.height*FOUR_VIEW_RATIO?FOUR_VIEW_RATIO:canvasRatioLimit(project.sourceCanvas);
 let canvas={...previous,[field]:pixels};
 if(locked&&pixels>0&&Number.isInteger(pixels)&&reference.width>0&&reference.height>0){
  canvas=dimensions(reference,{type:'pixels',locked:true,anchor:field,[field]:pixels});
  // Integer rounding can take a boundary frame just beyond the allowed ratio.
  if(aspectRatio(reference)<=limit&&aspectRatio(canvas)>limit){
   const other=field==='width'?'height':'width';
   canvas[other]=Math.max(Math.ceil(canvas[field]/limit),Math.min(canvas[other],Math.floor(canvas[field]*limit)));
  }
 }
 const lastValid=controls.custom??(validFrame(previous,limit)?previous:undefined);
 return withCanvas(project,canvas,{...controls,preset:'custom',custom:validFrame(canvas,limit)?canvas:lastValid,reference});
}
