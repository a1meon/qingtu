import test from 'node:test';
import assert from 'node:assert/strict';
import {importCanvasImages,restoreSingleImportFrame} from '../engine/canvas-import.mjs';
import {fitHeightCanvas} from '../engine/canvas-height.mjs';
import {setImageEdit,imageGeometry,changeCropEdge} from '../engine/stitch-edits.mjs';
import {applyCanvasTransform,resizeImageRect} from '../engine/canvas-transform.mjs';
import {reorderCanvas} from '../engine/canvas-order.mjs';
import {switchCanvasLayout,rememberCanvasLayout} from '../engine/canvas-layout-state.mjs';
import {calculateLayout} from '../engine/stitch-layout.mjs';
import {splitProjectImage} from '../engine/stitch-split.mjs';
const img=(id,width,height)=>({id,assetId:id,width,height,bytes:100});
const project=()=>({id:'height',canvasMode:'fixed',heightLocked:true,canvasSizing:'content',canvas:{width:5995,height:2398},layout:'horizontal',grid:{rows:2,columns:2},images:[],initialOrder:[],edits:{},positions:{},export:{format:'png',longEdge:5999,targetBytes:10000000}});
const four=()=>importCanvasImages(project(),[img('face',3072,4096),img('side',3072,4096),img('front',2160,3840),img('back',2160,3840)]);

test('two combined images and four individual portraits keep height and cap width without changing any source crop',()=>{
 for(const images of [[img('faces',6144,4096),img('bodies',4320,3840)],four().images]){
  const p=importCanvasImages(project(),images);assert.deepEqual(p.canvas,{width:5755,height:2398});assert.deepEqual(p.edits,{});assert.ok(p.positions[images.at(-1).id].x+p.positions[images.at(-1).id].width>5995);assert.doesNotThrow(()=>calculateLayout(p));assert.ok(Object.values(p.positions).every(p=>p.height===2398));
 }
 const one=importCanvasImages(project(),[img('face',3072,4096)]);assert.deepEqual(one.canvas,{width:1799,height:2398});
});
test('horizontal width resize scales the image proportionally, preserves canvas height and stops canvas growth at 2.4',()=>{
 const p=four(),pose=resizeImageRect(p.positions.front,'e',800,0),resized=applyCanvasTransform(p,{...p.positions,front:pose},'resize');assert.deepEqual(resized.canvas,p.canvas);assert.ok(resized.positions.front.height>2398);assert.ok(resized.positions.front.y<0);assert.equal(resized.positions.back.x,resized.positions.front.x+resized.positions.front.width);assert.equal(resized.positions.face.width,p.positions.face.width);assert.deepEqual(resized.edits,p.edits);
 const one=importCanvasImages(project(),[img('face',3,4)]),small=applyCanvasTransform(one,{face:resizeImageRect(one.positions.face,'e',-400,0)},'resize');assert.equal(small.canvas.height,2398);assert.equal(small.canvas.width,Math.round(one.positions.face.width-400));
});
test('cropping preserves image scale and the opposite edge on a fixed-height row',()=>{
 const p=four(),pose=p.positions.front,scale=pose.height/3840;
 const crop=(project,top,bottom)=>setImageEdit(project,'front',{edges:{left:0,right:0,top,bottom}});
 const top=crop(p,700,0),bottom=crop(p,0,700);
 for(const result of [top,bottom]){
  assert.equal(result.positions.front.width,pose.width);
  assert.equal(result.positions.front.height,3140*scale);
  assert.deepEqual(result.positions.back,p.positions.back);
  assert.deepEqual(result.canvas,p.canvas);
 }
 assert.ok(Math.abs(top.positions.front.y-pose.y-700*scale)<1e-8);
 assert.ok(Math.abs(bottom.positions.front.y-pose.y)<1e-8);
 for(const [result,expected] of [[crop(top,0,700),bottom],[crop(top,0,0),p]]){
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(result.positions.front[key]-expected.positions.front[key])<1e-8,key);
 }
});
test('a one-pixel crop on a rotated image moves the cut edge in local image coordinates',()=>{
 const source=img('rotated',100,100);
 const p={...project(),layout:'free',images:[{...source,angle:90}],positions:{rotated:{x:10,y:20,width:200,height:300}}};
 const next=setImageEdit(p,'rotated',{edges:{top:1,bottom:0,left:0,right:0}});
 assert.deepEqual(next.positions.rotated,{x:8.5,y:21.5,width:200,height:297});
});

test('association applies equal opposite cuts, unlinking preserves the other edge and limits cannot discard all source pixels',()=>{
 const defaults=setImageEdit(four(),'front',{edges:{left:0,right:0,top:0,bottom:0}});assert.deepEqual(defaults.edits.front.links,{horizontal:true,vertical:false});
 const image=img('a',100,160),edges={left:5,right:10,top:20,bottom:0};assert.deepEqual(changeCropEdge(image,edges,'top',30,false),{...edges,top:30});assert.deepEqual(changeCropEdge(image,edges,'left',15,true),{...edges,left:15,right:15});assert.equal(changeCropEdge(image,edges,'top',500,true).top,79);assert.equal(changeCropEdge(image,edges,'left',500,false).left,89);
 assert.throws(()=>imageGeometry(image,{edges:{...edges,left:100}}),/四边裁剪/);
});
test('drag ordering preserves edited image dimensions, all crop edges and true original order, including at the cap',()=>{
 let p=four();p=setImageEdit(p,'front',{edges:{left:0,right:0,top:700,bottom:0},links:{horizontal:true,vertical:false}});const before=structuredClone(p);p=reorderCanvas(p,'front','face');assert.deepEqual(p.images.map(i=>i.id),['front','side','face','back']);assert.deepEqual(p.initialOrder,before.initialOrder);assert.deepEqual(p.edits,before.edits);assert.equal(p.positions.front.x,0);for(const image of p.images){assert.equal(p.positions[image.id].width,before.positions[image.id].width);assert.equal(p.positions[image.id].height,before.positions[image.id].height);}assert.deepEqual(p.canvas,before.canvas);
});
test('swapping uses the visible slots when returning to a remembered layout',()=>{
 for(const mode of ['horizontal','vertical','grid']){
  const frame=switchCanvasLayout(four(),mode),other=mode==='grid'?'horizontal':'grid';
  const originalIds=frame.images.map(image=>image.id);
  const elsewhere=reorderCanvas(switchCanvasLayout(frame,other),originalIds[0],originalIds[2]);
  const restored=switchCanvasLayout(elsewhere,mode);
  assert.deepEqual(restored.positions,frame.positions);
  const swapped=reorderCanvas(restored,originalIds[0],originalIds[2]);
  assert.deepEqual(swapped.images.map(image=>image.id),[originalIds[2],originalIds[1],originalIds[0],originalIds[3]],mode);
 }
});
test('height canvas and edits recover per layout; imports update each remembered frame without normalizing an existing zoom',()=>{
 let p=rememberCanvasLayout(four());p=switchCanvasLayout(p,'free');p=rememberCanvasLayout({...p,positions:{...p.positions,front:resizeImageRect(p.positions.front,'e',200,0)}});p=switchCanvasLayout(p,'horizontal');const row=structuredClone(p);p=importCanvasImages(p,[img('extra',3000,4000)]);p=switchCanvasLayout(p,'free');assert.equal(p.images.length,5);assert.equal(p.canvas.height,row.canvas.height);p=switchCanvasLayout(p,'horizontal');assert.equal(p.positions.front.width,row.positions.front.width);assert.equal(p.canvas.height,2398);
 const manual=fitHeightCanvas({...p,canvasSizing:'manual',canvas:{width:4000,height:2000}});assert.deepEqual(manual.canvas,{width:4000,height:2000});
});

test('two combined originals can split the bodies and crop only the front head while the back shares the unchanged original',()=>{
 const p=importCanvasImages(project(),[img('faces',6144,4096),img('bodies',4320,3840)]),split=splitProjectImage(p,'bodies','x',2160,['front','back']);
 const cropped=setImageEdit(split,'front',{edges:{left:0,top:850,right:0,bottom:0},links:{horizontal:true,vertical:false}});
 assert.deepEqual(cropped.images.map(i=>i.id),['faces','front','back']);assert.equal(cropped.images[1].source.left,0);assert.equal(cropped.images[2].source.left,2160);assert.equal(cropped.images[1].assetId,cropped.images[2].assetId);assert.equal(cropped.images[1].assetId,'bodies');assert.equal(cropped.edits.back,undefined);assert.equal(imageGeometry(cropped.images[1],cropped.edits.front).top,850);assert.ok(Math.abs(cropped.positions.front.height-split.positions.front.height*(3840-850)/3840)<1e-8);assert.deepEqual(cropped.canvas,{width:5755,height:2398});assert.deepEqual(p.edits,{});
});

test('a single import keeps its source dimensions up to the inclusive 5999 px limit',()=>{
 for(const [width,height,w,h] of [[220,120,220,120],[4200,300,4200,300],[5999,800,5999,800],[6000,4000,5999,3999],[80,9001,53,5999],[17001,37,5999,13]]){
  const item=img('photo',width,height),p=importCanvasImages(project(),[item],{useSourceSize:true}),frame={width:w,height:h};
  assert.deepEqual(p.canvas,frame);
  assert.deepEqual(p.positions.photo,{x:0,y:0,...frame});
  assert.deepEqual(p.importSizes.photo,frame);
  for(const layout of ['horizontal','free','vertical']){
   const actual=calculateLayout(switchCanvasLayout(p,layout));
   assert.deepEqual([actual.width,actual.height],[w,h]);
  }
 }
 const saved={...project(),canvas:{width:600,height:240}};
 assert.deepEqual(importCanvasImages(saved,[img('photo',3072,4096)],{useSourceSize:true}).canvas,{width:180,height:240});
 const manual={...project(),canvas:{width:800,height:400},canvasSizing:'manual'};
 assert.deepEqual(importCanvasImages(manual,[img('photo',240,180)],{useSourceSize:true}).canvas,manual.canvas);
});

test('repair only the untouched saved import that was scaled to the old empty canvas',()=>{
 const old=importCanvasImages(project(),[img('small',720,500)]);
 const restored=restoreSingleImportFrame(old);
 assert.deepEqual(restored.canvas,{width:720,height:500});assert.deepEqual(restored.importSizes.small,restored.canvas);
 assert.equal(restoreSingleImportFrame(restored),restored);
 for(const changed of [{...old,canvasSizing:'manual'},{...old,positions:{small:{...old.positions.small,x:15}}}]){
  assert.equal(restoreSingleImportFrame(changed),changed);
 }
});
