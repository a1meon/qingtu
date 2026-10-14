import {arrangeImages,appendFixedImages} from './canvas-fixed.mjs';
import {imageGeometry} from './stitch-edits.mjs';

const modes=['horizontal','grid','vertical','free'];
const validPose=p=>p&&['x','y','width','height'].every(key=>Number.isFinite(p[key])&&Math.abs(p[key])<=Number.MAX_SAFE_INTEGER/4)&&p.width>0&&p.height>0;
// Store complete-source rectangles, so a later global crop/reset can retain
// each layout's centre and source scale without reviving an obsolete crop.
function fullPose(project,image){
 const p=project.positions[image.id],source=imageGeometry(image,project.edits?.[image.id]);
 if(source.width===image.width&&source.height===image.height)return {x:p.x,y:p.y,width:p.width,height:p.height};
 const width=p.width*image.width/source.width,height=p.height*image.height/source.height;
 return {x:p.x+(p.width-width)/2,y:p.y+(p.height-height)/2,width,height};
}
function visiblePose(project,image,p){
 const source=imageGeometry(image,project.edits?.[image.id]),width=p.width*source.width/image.width,height=p.height*source.height/image.height;
 if(source.width===image.width&&source.height===image.height)return {x:p.x,y:p.y,width:p.width,height:p.height};
 return {x:p.x+(p.width-width)/2,y:p.y+(p.height-height)/2,width,height};
}
function restore(project,state){
 const present=project.images.filter(image=>state[image.id]),missing=project.images.filter(image=>!state[image.id]);
 const positions=Object.fromEntries(present.map(image=>[image.id,visiblePose(project,image,state[image.id])]));
 return appendFixedImages({...project,images:present,positions},missing).positions;
}
export function rememberCanvasLayout(project){
 if(project.canvasMode!=='fixed')return project;
 if(!project.images.length)return {...project,layoutStates:{}};
 const layoutStates={};
 for(const mode of modes){
  const state=project.layoutStates?.[mode];if(!state)continue;
  const positions=restore(project,state),withPositions={...project,positions};
  layoutStates[mode]=Object.fromEntries(project.images.map(image=>[image.id,state[image.id]||fullPose(withPositions,image)]));
 }
 layoutStates[project.layout]=Object.fromEntries(project.images.map(image=>[image.id,fullPose(project,image)]));
 return {...project,layoutStates};
}
export function switchCanvasLayout(project,type){
 if(!modes.includes(type))throw new Error('布局类型无效');
 if(type===project.layout)return project;
 const remembered=rememberCanvasLayout(project),state=remembered.layoutStates?.[type];
 let next;
 if(state)next={...remembered,layout:type,positions:restore(remembered,state)};
 else try{next=arrangeImages(remembered,type);}catch(error){if(type!=='grid'||!error.message.includes('行列'))throw error;next={...remembered,layout:type};}
 return rememberCanvasLayout(next);
}
export function splitLayoutStates(states,id,ids,axis,fraction){
 if(!states)return states;
 return Object.fromEntries(Object.entries(states).map(([mode,state])=>{
  const p=state[id];if(!p)return [mode,state];
  const next={...state};delete next[id];
  next[ids[0]]={...p,width:axis==='x'?p.width*fraction:p.width,height:axis==='y'?p.height*fraction:p.height};
  next[ids[1]]={x:p.x+(axis==='x'?p.width*fraction:0),y:p.y+(axis==='y'?p.height*fraction:0),width:axis==='x'?p.width*(1-fraction):p.width,height:axis==='y'?p.height*(1-fraction):p.height};
  return [mode,next];
 }));
}
export function removeLayoutImageStates(states,id){return states&&Object.fromEntries(Object.entries(states).map(([mode,state])=>[mode,Object.fromEntries(Object.entries(state).filter(([key])=>key!==id))]));}
export function validateLayoutStates(project){
 if(project.layoutStates===undefined)return;
 const states=project.layoutStates,ids=new Set(project.images.map(image=>image.id));
 if(!states||typeof states!=='object'||Array.isArray(states))throw new Error('布局记忆数据无效');
 for(const [mode,state] of Object.entries(states)){
  if(!modes.includes(mode)||!state||typeof state!=='object'||Array.isArray(state)||Object.entries(state).some(([id,pose])=>!ids.has(id)||!validPose(pose)))throw new Error('布局记忆数据无效');
 }
}
