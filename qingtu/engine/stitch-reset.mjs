import {setImageEdit} from './stitch-edits.mjs';
import {appendFreeImages} from './stitch-layout.mjs';
import {appendFixedImages,arrangeImages,arrangeContentImages} from './canvas-fixed.mjs';
import {removeLayoutImageStates} from './canvas-layout-state.mjs';
import {fitHeightCanvas} from './canvas-height.mjs';
import {removeImportSize} from './import-sizes.mjs';
import {rejoinSplitImages} from './split-origin.mjs';
import {resetFixedCanvas} from './canvas-reset.mjs';
import {clearImageColor} from './image-color.mjs';

export function validateImportOrder(project){
 if(project.initialOrder===undefined)return;
 const order=project.initialOrder,ids=project.images.map(image=>image.id);
 if(!Array.isArray(order)||order.length!==ids.length||new Set(order).size!==ids.length||order.some(id=>!ids.includes(id)))throw new Error('导入顺序数据无效');
}
// Empty/single-image projects have one possible relative order. Never infer a
// multi-image legacy order from filenames, timestamps or its edited sequence.
export function knownImportOrder(project){
 validateImportOrder(project);
 return project.initialOrder??(project.images.length<=1?project.images.map(image=>image.id):undefined);
}
export function recordImportOrder(project,order){
 const next={...project,initialOrder:[...order]};validateImportOrder(next);return next;
}
export function appendProjectImages(project,images){
 const order=knownImportOrder(project),next=project.canvasMode==='fixed'?appendFixedImages(project,images):project.layout==='free'?appendFreeImages(project,images):{...project,images:[...project.images,...images]};
 return order?{...next,initialOrder:[...order,...images.map(image=>image.id)]}:next;
}
// True when the images' boxes leave no empty space inside their bounding box.
// Split pieces tile their parent exactly, so this detects the gaps a deletion
// leaves in a split image without counting deliberate overlaps or resizes.
function coversWithoutGaps(project){
 const boxes=project.images.map(image=>project.positions?.[image.id]).filter(Boolean);
 if(!boxes.length)return true;
 const x0=Math.min(...boxes.map(b=>b.x)),y0=Math.min(...boxes.map(b=>b.y));
 const x1=Math.max(...boxes.map(b=>b.x+b.width)),y1=Math.max(...boxes.map(b=>b.y+b.height));
 const area=boxes.reduce((sum,b)=>sum+b.width*b.height,0);
 return area>=(x1-x0)*(y1-y0)*.995;
}

export function removeProjectImage(project,id){
 const order=knownImportOrder(project),edits={...project.edits},positions={...project.positions};delete edits[id];delete positions[id];
 const next={...project,images:project.images.filter(image=>image.id!==id),edits,positions,...(project.importSizes?{importSizes:removeImportSize(project.importSizes,id)}:{}),...(project.layoutStates?{layoutStates:removeLayoutImageStates(project.layoutStates,id)}:{})};
 const removed=order?{...next,initialOrder:order.filter(item=>item!==id)}:next;
 const result=project.heightLocked&&project.layout==='horizontal'?fitHeightCanvas(removed):removed;
 // Deleting a piece of a split image would leave a hole in a structured
 // layout. When the canvas was gapless before and would not be after, the
 // remaining images are arranged again by the layout's own rules. Free layout
 // keeps every position, and gaps the user already made stay untouched.
 if(project.canvasMode==='fixed'&&['horizontal','grid','vertical'].includes(project.layout)&&result.images.length&&
    coversWithoutGaps(project)&&!coversWithoutGaps(result)){
  const arrange=grid=>{
   const next=grid===result.grid?result:{...result,grid};
   return project.canvasSizing==='content'?arrangeContentImages(next,project.layout,grid):arrangeImages(next,project.layout,grid);
  };
  try{return arrange(result.grid);}
  catch{
   // A grid whose rows and columns no longer suit the remaining images takes
   // the nearest arrangement that holds them all.
   if(project.layout!=='grid')return result;
   const count=result.images.length,rows=Math.max(1,Math.min(result.grid?.rows||1,count));
   try{return arrange({...result.grid,rows,columns:Math.ceil(count/rows)});}catch{return result;}
  }
 }
 return result;
}
export function resetProject(project){
 const order=knownImportOrder(project);
 if(!order)throw new Error('缺少最初导入顺序，请先提供真实顺序');
 if(project.canvasMode==='fixed'){
  const joined=rejoinSplitImages({...project,images:project.images.map(clearImageColor)},order);
  return resetFixedCanvas(joined,joined.initialOrder?.map(id=>joined.images.find(image=>image.id===id))??joined.images);
 }
 let next=project;
 for(const image of project.images)if(project.edits?.[image.id])next=setImageEdit(next,image.id,{axis:'horizontal',amount:0});
 const reset={...next,images:order.map(id=>clearImageColor(project.images.find(image=>image.id===id))),initialOrder:[...order],edits:{}};
 return project.heightLocked&&project.layout==='horizontal'?fitHeightCanvas(reset):reset;
}
