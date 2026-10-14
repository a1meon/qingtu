import {setImageEdit} from './stitch-edits.mjs';
import {appendFreeImages} from './stitch-layout.mjs';
import {appendFixedImages} from './canvas-fixed.mjs';
import {removeLayoutImageStates} from './canvas-layout-state.mjs';

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
export function removeProjectImage(project,id){
 const order=knownImportOrder(project),edits={...project.edits},positions={...project.positions};delete edits[id];delete positions[id];
 const next={...project,images:project.images.filter(image=>image.id!==id),edits,positions,...(project.layoutStates?{layoutStates:removeLayoutImageStates(project.layoutStates,id)}:{})};
 return order?{...next,initialOrder:order.filter(item=>item!==id)}:next;
}
export function resetProject(project){
 const order=knownImportOrder(project);
 if(!order)throw new Error('缺少最初导入顺序，请先提供真实顺序');
 let next=project;
 for(const image of project.images)if(project.edits?.[image.id])next=setImageEdit(next,image.id,{axis:'horizontal',amount:0});
 return {...next,images:order.map(id=>project.images.find(image=>image.id===id)),initialOrder:[...order],edits:{}};
}
