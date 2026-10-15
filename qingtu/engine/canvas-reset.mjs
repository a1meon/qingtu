import {arrangeImages,arrangeContentImages} from './canvas-fixed.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';
import {rememberCanvasLayout} from './canvas-layout-state.mjs';
import {sourceWindow} from './image-source.mjs';
import {validateImportSizes} from './import-sizes.mjs';

function resetPositions(project){
 return Object.fromEntries(project.images.map(image=>{
  const pose=project.positions[image.id],source=sourceWindow(image);
  // Old split pieces share their original asset's scale instead of each
  // expanding to a full canvas height independently.
  const scale=project.canvas.height/source.fullHeight;
  const size=project.importSizes?.[image.id]||{width:image.width*scale,height:image.height*scale};
  return [image.id,{x:pose.x+pose.width/2-size.width/2,y:pose.y+pose.height/2-size.height/2,...size}];
 }));
}
function resetLayout(project){
 const next={...project,positions:resetPositions(project)};
 if(project.layout==='horizontal'){
  let x=0;for(const image of next.images){next.positions[image.id]={...next.positions[image.id],x,y:0};x+=next.positions[image.id].width;}
 }else if(project.layout!=='free'){
  // Tight rows/columns use the layout's proportional arrangement; retaining
  // arbitrary stretched boxes here would leave gaps or overlap neighbours.
  return project.canvasSizing==='content'?arrangeContentImages(next):arrangeImages(next);
 }
 return project.heightLocked?fitHeightCanvas(next):next;
}
export function resetFixedCanvas(project,images){
 validateImportSizes(project);
 const remembered=rememberCanvasLayout(project),base={...remembered,images,initialOrder:images.map(image=>image.id),edits:{}};
 const active=resetLayout(base),layoutStates={},layoutCanvases={};
 for(const [mode,state] of Object.entries(remembered.layoutStates||{})){
  const saved=remembered.layoutCanvases?.[mode];
  const other={...base,layout:mode,positions:state,...(saved?{canvas:{width:saved.width,height:saved.height},canvasSizing:saved.sizing}:{})};
  // A stale invalid grid must not prevent resetting a different valid layout.
  // Its dimensions still reset; the existing validation remains visible when
  // the user switches back to that grid.
  let reset=active;
  if(mode!==project.layout)try{reset=resetLayout(other);}catch(error){if(mode!=='grid'||!error.message.includes('行列'))throw error;reset={...other,positions:resetPositions(other)};}
  layoutStates[mode]=reset.positions;
  layoutCanvases[mode]={...reset.canvas,sizing:reset.canvasSizing||'manual',longEdge:saved?.longEdge??project.export?.longEdge??Math.max(reset.canvas.width,reset.canvas.height)};
 }
 return rememberCanvasLayout({...active,layoutStates,layoutCanvases});
}
