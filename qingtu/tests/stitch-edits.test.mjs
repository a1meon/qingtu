import test from 'node:test';
import assert from 'node:assert/strict';
import {imageGeometry,cropLimit,setImageEdit} from '../engine/stitch-edits.mjs';
import {calculateLayout,initializeFree,appendFreeImages} from '../engine/stitch-layout.mjs';

const a={id:'a',assetId:'a',width:120,height:100},b={id:'b',assetId:'b',width:80,height:100};
test('manual crop uses original integer pixels and exactly one symmetric axis',()=>{
 assert.deepEqual(imageGeometry(a,{axis:'horizontal',amount:10}),{left:10,top:0,width:100,height:100});
 assert.deepEqual(imageGeometry(a,{axis:'vertical',amount:20}),{left:0,top:20,width:120,height:60});
 assert.equal(cropLimit(a,'horizontal'),59);assert.equal(cropLimit(a,'vertical'),49);
 for(const edit of [{axis:'both',amount:10},{axis:'horizontal',amount:60},{axis:'vertical',amount:-1},{axis:'vertical',amount:1.5}])assert.throws(()=>imageGeometry(a,edit),/裁剪/);
});
test('horizontal, vertical and tight grids use the explicitly cropped aspect without hidden cuts or holes',()=>{
 const p={images:[a,b],edits:{a:{axis:'horizontal',amount:10}},export:{longEdge:200}};
 for(const layout of ['horizontal','vertical','grid']){
  const r=calculateLayout({...p,layout,grid:{rows:2,columns:1}}),rect=r.rects[0];
  assert.equal(rect.crop.left,10/120);assert.equal(rect.crop.top,0);assert.ok(!rect.autoCrop);assert.ok(Math.abs(rect.width-rect.height)<=1);assert.equal(r.rects[1].crop,null);
 }
 const vertical=setImageEdit(p,'a',{axis:'vertical',amount:10});assert.equal(vertical.edits.a.axis,'vertical');assert.equal(imageGeometry(a,vertical.edits.a).left,0);assert.equal(p.edits.a.axis,'horizontal');
});
test('free crop and reset preserve original scale and centre, and bound only explicitly visible content',()=>{
 const p={images:[a],layout:'free',positions:{a:{x:-30,y:40,width:240}},export:{longEdge:200}};
 const horizontal=setImageEdit(p,'a',{axis:'horizontal',amount:10});assert.deepEqual(horizontal.positions.a,{x:-10,y:40,width:200});
 const r=calculateLayout(horizontal);assert.deepEqual([r.width,r.height],[200,200]);assert.equal(r.rects[0].crop.left,10/120);
 const vertical=setImageEdit(horizontal,'a',{axis:'vertical',amount:10});assert.deepEqual(vertical.positions.a,{x:-30,y:60,width:240});assert.equal(imageGeometry(a,vertical.edits.a).left,0);
 const reset=setImageEdit(vertical,'a',{axis:'vertical',amount:0});assert.deepEqual(reset.positions.a,p.positions.a);
 const free=initializeFree({...horizontal,layout:'horizontal'},calculateLayout({...horizontal,layout:'horizontal'}));assert.equal(free.positions.a.width,200);assert.equal(free.edits.a.amount,10);
 const added=appendFreeImages(horizontal,[b]);assert.equal(added.positions.b.width,160);assert.equal(added.positions.b.x,190);
});
test('edited 9:16 images never receive a second automatic crop; other eligible originals retain the approved rule',()=>{
 const images=[{...a,id:'one',width:300,height:400},{...a,id:'two',width:300,height:400},{...a,id:'three',width:900,height:1600},{...a,id:'four',width:900,height:1600}];
 const p={images,layout:'horizontal',edits:{three:{axis:'vertical',amount:50}},export:{longEdge:5999}};
 const r=calculateLayout(p);assert.equal(r.rects[2].autoCrop,false);assert.equal(r.rects[2].crop.left,0);assert.equal(r.rects[2].crop.top,50/1600);assert.equal(r.rects[3].autoCrop,true);
 p.edits.four={axis:'vertical',amount:50};assert.throws(()=>calculateLayout(p),/仅 9:16/);
});
