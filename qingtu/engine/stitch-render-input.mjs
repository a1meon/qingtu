import {hasImageColor, normalizeImageColor} from './image-color.mjs';

// Only pixel-affecting edits, source assets and encoding parameters affect the result.
export function stitchRenderKey(project){
 const {id,canvasMode,canvas,sourceCanvas,layout,grid,positions}=project;
 const images=project.images.map(({id,assetId,width,height,bytes,source,rotation=0,angle=0,color})=>({id,assetId,width,height,bytes,source,rotation,angle,color:hasImageColor(color)?normalizeImageColor(color):undefined}));
 const edits=Object.entries(project.edits||{}).map(([id,edit])=>{
  if(!edit?.edges)return [id,edit];
  const {left,right,top,bottom}=edit.edges;
  return [id,{left,right,top,bottom}];
 });
 const {format,targetBytes,longEdge}=project.export||{};
 return JSON.stringify({id,canvasMode,canvas,sourceCanvas,layout,grid,positions,images,edits,format,targetBytes,longEdge});
}

export function fullCanvasImage(project,layout){
 const [image]=project.images,rect=layout?.rects[0];
 if(!rect||project.images.length!==1||image.source||image.rotation||image.angle||hasImageColor(image.color))return null;
 if(rect.autoCrop||rect.x!==0||rect.y!==0||rect.width!==layout.width||rect.height!==layout.height||
    Object.values(rect.crop||{}).some(Boolean))return null;
 return image;
}

export function originalCanvasImage(project,layout){
 const image=fullCanvasImage(project,layout);
 if(!image||image.width!==layout.width||image.height!==layout.height)return null;
 const {targetBytes=10000000,format='png'}=project.export||{};
 if(!Number.isInteger(targetBytes)||targetBytes<64||targetBytes>100000000||image.bytes>targetBytes||
    !['png','jpeg'].includes(format)||(image.format&&image.format!==format))return null;
 return image;
}
