import {rotateVector} from './image-rotation.mjs';
import {sourceWindow} from './image-source.mjs';
import {imageGeometry} from './stitch-edits.mjs';

// Store only geometry and identity. Every descendant still uses the immutable
// asset, and carries the same root even after more splits, reordering or reload.
export function splitOrigin(project,image){
 const {id,name,width,height,rotation,angle}=image;
 const layouts=Object.fromEntries(Object.entries(project.layoutStates||{}).filter(([,state])=>state[id]).map(([mode,state])=>[mode,state[id]]));
 return {id,name,width,height,rotation,angle,position:project.positions[id],size:project.importSizes?.[id],layouts};
}

function legacyOrigin(project,image,name){
 const window=sourceWindow(image),source=imageGeometry(image,project.edits?.[image.id]);
 function expand(p,cut){
  const sx=p.width/cut.width,sy=p.height/cut.height,width=window.fullWidth*sx,height=window.fullHeight*sy;
  const shift=rotateVector((window.fullWidth/2-window.left-cut.left-cut.width/2)*sx,
   (window.fullHeight/2-window.top-cut.top-cut.height/2)*sy,image.angle||0);
  return {x:p.x+(p.width-width)/2+shift.x,y:p.y+(p.height-height)/2+shift.y,width,height};
 }
 const origin=splitOrigin(project,image),fullPiece={left:0,top:0,width:image.width,height:image.height};
 return {...origin,name,width:window.fullWidth,height:window.fullHeight,position:expand(origin.position,source),
  size:origin.size&&{width:origin.size.width*window.fullWidth/image.width,height:origin.size.height*window.fullHeight/image.height},
  layouts:Object.fromEntries(Object.entries(origin.layouts).map(([mode,p])=>[mode,expand(p,fullPiece)]))};
}

// Legacy imports have no root ID. Their import order is depth-first: at the
// first differing branch a later piece is right of left, or below top. Gaps
// are possible after deletion. A repeated path starts a separate import.
function followsBranch(previous,next){
 for(let i=0;i<Math.min(previous.length,next.length);i++){
  if(previous[i]!==next[i])return previous[i]==='左'&&next[i]==='右'||previous[i]==='上'&&next[i]==='下';
 }
 return false;
}
export function identifyLegacySplits(project){
 if(!project.images.some(image=>image.source&&!image.splitOrigin))return project;
 const byId=new Map(project.images.map(image=>[image.id,image])),origins=new Map();
 let previous;
 for(const id of project.initialOrder||byId.keys()){
  const image=byId.get(id);
  if(!image?.source||image.splitOrigin){previous=null;continue;}
  const name=image.name||'图片',suffix=name.match(/(?: · [左右上下])+$/u)?.[0]||'';
  const base=name.slice(0,name.length-suffix.length),branch=suffix.split(' · ').slice(1);
  const sameImport=project.initialOrder&&previous?.assetId===image.assetId&&previous.base===base&&followsBranch(previous.branch,branch);
  const origin=sameImport?previous.origin:legacyOrigin(project,image,base);
  origins.set(id,origin);previous={assetId:image.assetId,base,branch,origin};
 }
 return {...project,images:project.images.map(image=>origins.has(image.id)?{...image,splitOrigin:origins.get(image.id)}:image)};
}

export function rejoinSplitImages(project,order){
 project=identifyLegacySplits(project);
 if(!project.images.some(image=>image.splitOrigin))return project;
 const byId=new Map(project.images.map(image=>[image.id,image])),images=[],positions={},importSizes={},edits={},seen=new Set();
 const layouts=Object.fromEntries(Object.keys(project.layoutStates||{}).map(mode=>[mode,{}]));
 for(const pieceId of order){
  const piece=byId.get(pieceId),root=piece.splitOrigin,id=root?.id??pieceId;
  if(seen.has(id))continue;
  seen.add(id);
  let image=piece;
  if(root){
   const {source,splitOrigin,rotation,angle,...rest}=piece;
   image={...rest,id,width:root.width,height:root.height};
   if(root.name!==undefined)image.name=root.name;else delete image.name;
   if(root.rotation!==undefined)image.rotation=root.rotation;
   if(root.angle!==undefined)image.angle=root.angle;
   if((rotation||0)!==(root.rotation||0))delete image.preview;
  }else if(project.edits?.[id])edits[id]=project.edits[id];
  images.push(image);positions[id]=root?.position??project.positions[id];
  const size=root?root.size:project.importSizes?.[id];if(size)importSizes[id]=size;
  for(const [mode,state] of Object.entries(layouts))state[id]=root?(root.layouts?.[mode]??positions[id]):(project.layoutStates[mode][id]??positions[id]);
 }
 const grid=project.layout==='grid'&&project.grid?.rows>images.length?{...project.grid,rows:images.length}:project.grid;
 return {...project,images,grid,initialOrder:images.map(image=>image.id),positions,edits,
  ...(project.importSizes&&{importSizes}),...(project.layoutStates&&{layoutStates:layouts})};
}
