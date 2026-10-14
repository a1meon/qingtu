import test from 'node:test';
import assert from 'node:assert/strict';
import {importCanvasImages} from '../engine/canvas-import.mjs';
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
  const p=importCanvasImages(project(),images);assert.deepEqual(p.canvas,{width:5995,height:2398});assert.deepEqual(p.edits,{});assert.ok(p.positions[images.at(-1).id].x+p.positions[images.at(-1).id].width>5995);assert.doesNotThrow(()=>calculateLayout(p));assert.ok(Object.values(p.positions).every(p=>p.height===2398));
 }
 const one=importCanvasImages(project(),[img('face',3072,4096)]);assert.deepEqual(one.canvas,{width:1799,height:2398});
});
test('horizontal width resize scales the image proportionally, preserves canvas height and stops canvas growth at 2.5',()=>{
 const p=four(),pose=resizeImageRect(p.positions.front,'e',800,0),resized=applyCanvasTransform(p,{...p.positions,front:pose},'resize');assert.deepEqual(resized.canvas,p.canvas);assert.ok(resized.positions.front.height>2398);assert.ok(resized.positions.front.y<0);assert.equal(resized.positions.back.x,resized.positions.front.x+resized.positions.front.width);assert.equal(resized.positions.face.width,p.positions.face.width);assert.deepEqual(resized.edits,p.edits);
 const one=importCanvasImages(project(),[img('face',3,4)]),small=applyCanvasTransform(one,{face:resizeImageRect(one.positions.face,'e',-400,0)},'resize');assert.equal(small.canvas.height,2398);assert.equal(small.canvas.width,Math.round(one.positions.face.width-400));
});
test('independent four-edge crops retain fixed display height and front top-only crop leaves other sources unchanged',()=>{
 const p=four(),edit={edges:{left:0,right:0,top:700,bottom:0},links:{horizontal:true,vertical:false}},next=setImageEdit(p,'front',edit);assert.deepEqual(imageGeometry(p.images[2],next.edits.front),{left:0,top:700,width:2160,height:3140});assert.equal(next.positions.front.height,p.positions.front.height);assert.ok(next.positions.front.width>p.positions.front.width);assert.deepEqual(next.images,p.images);assert.deepEqual(next.edits.front,edit);assert.equal(next.edits.face,undefined);assert.equal(next.canvas.height,2398);assert.equal(next.canvas.width,5995);
 const both=setImageEdit(next,'front',{edges:{left:100,right:150,top:700,bottom:50},links:{horizontal:false,vertical:false}});assert.deepEqual(imageGeometry(p.images[2],both.edits.front),{left:100,top:700,width:1910,height:3090});assert.equal(both.positions.front.height,2398);
});
test('association applies equal opposite cuts, unlinking preserves the other edge and limits cannot discard all source pixels',()=>{
 const defaults=setImageEdit(four(),'front',{edges:{left:0,right:0,top:0,bottom:0}});assert.deepEqual(defaults.edits.front.links,{horizontal:true,vertical:false});
 const image=img('a',100,160),edges={left:5,right:10,top:20,bottom:0};assert.deepEqual(changeCropEdge(image,edges,'top',30,false),{...edges,top:30});assert.deepEqual(changeCropEdge(image,edges,'left',15,true),{...edges,left:15,right:15});assert.equal(changeCropEdge(image,edges,'top',500,true).top,79);assert.equal(changeCropEdge(image,edges,'left',500,false).left,89);
 assert.throws(()=>imageGeometry(image,{edges:{...edges,left:100}}),/四边裁剪/);
});
test('drag ordering preserves edited image dimensions, all crop edges and true original order, including at the cap',()=>{
 let p=four();p=setImageEdit(p,'front',{edges:{left:0,right:0,top:700,bottom:0},links:{horizontal:true,vertical:false}});const before=structuredClone(p);p=reorderCanvas(p,'front','face');assert.deepEqual(p.images.map(i=>i.id),['front','face','side','back']);assert.deepEqual(p.initialOrder,before.initialOrder);assert.deepEqual(p.edits,before.edits);assert.equal(p.positions.front.x,0);for(const image of p.images){assert.equal(p.positions[image.id].width,before.positions[image.id].width);assert.equal(p.positions[image.id].height,before.positions[image.id].height);}assert.deepEqual(p.canvas,before.canvas);
});
test('height canvas and edits recover per layout; imports update each remembered frame without normalizing an existing zoom',()=>{
 let p=rememberCanvasLayout(four());p=switchCanvasLayout(p,'free');p=rememberCanvasLayout({...p,positions:{...p.positions,front:resizeImageRect(p.positions.front,'e',200,0)}});p=switchCanvasLayout(p,'horizontal');const row=structuredClone(p);p=importCanvasImages(p,[img('extra',3000,4000)]);p=switchCanvasLayout(p,'free');assert.equal(p.images.length,5);assert.equal(p.canvas.height,row.canvas.height);p=switchCanvasLayout(p,'horizontal');assert.equal(p.positions.front.width,row.positions.front.width);assert.equal(p.canvas.height,2398);
 const manual=fitHeightCanvas({...p,canvasSizing:'manual',canvas:{width:4000,height:2000}});assert.deepEqual(manual.canvas,{width:4000,height:2000});
});

test('two combined originals can split the bodies and crop only the front head while the back shares the unchanged original',()=>{
 const p=importCanvasImages(project(),[img('faces',6144,4096),img('bodies',4320,3840)]),split=splitProjectImage(p,'bodies','x',2160,['front','back']);
 const cropped=setImageEdit(split,'front',{edges:{left:0,top:850,right:0,bottom:0},links:{horizontal:true,vertical:false}});
 assert.deepEqual(cropped.images.map(i=>i.id),['faces','front','back']);assert.equal(cropped.images[1].source.left,0);assert.equal(cropped.images[2].source.left,2160);assert.equal(cropped.images[1].assetId,cropped.images[2].assetId);assert.equal(cropped.images[1].assetId,'bodies');assert.equal(cropped.edits.back,undefined);assert.equal(imageGeometry(cropped.images[1],cropped.edits.front).top,850);assert.equal(cropped.positions.front.height,2398);assert.deepEqual(cropped.canvas,{width:5995,height:2398});assert.deepEqual(p.edits,{});
});
