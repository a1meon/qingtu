import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CANVAS} from '../engine/canvas-limits.mjs';
import {calculateLayout,moveImage} from '../engine/stitch-layout.mjs';
import {arrangeImages,appendFixedImages} from '../engine/canvas-fixed.mjs';
import {migrateFixedCanvas} from '../engine/canvas-migrate.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {resetProject,appendProjectImages} from '../engine/stitch-reset.mjs';
import {optimizeHorizontal,optimizationAvailability} from '../engine/stitch-optimize.mjs';
const image=(id,width,height)=>({id,assetId:id,width,height});
const project=(images=[])=>({id:'fixed',canvasMode:'fixed',canvas:{...DEFAULT_CANVAS},images,initialOrder:images.map(i=>i.id),layout:'horizontal',grid:{rows:2,columns:2},positions:{},edits:{},export:{longEdge:5995,format:'png',targetBytes:1000000}});

test('default fixed canvas is exact 5:2 even before images are imported',()=>{
 const p=project(),layout=calculateLayout(p);assert.deepEqual([layout.width,layout.height],[5995,2398]);assert.equal(layout.width*2,layout.height*5);assert.deepEqual(layout.rects,[]);
});
test('fixed imports append on the right at the existing height without resizing previous images or canvas',()=>{
 const a=image('a',3000,4000),b=image('b',900,1600),c=image('c',1600,900),p=appendProjectImages(project(),[a,b]);
 assert.deepEqual(p.positions.a,{x:0,y:0,width:1798.5,height:2398});assert.equal(p.positions.b.x,1798.5);assert.equal(p.positions.b.height,2398);
 const moved={...p,positions:{...p.positions,a:{x:-30,y:20,width:200,height:400},b:{x:200,y:60,width:100,height:300}}},next=appendFixedImages(moved,[c]);
 assert.deepEqual(next.positions.a,moved.positions.a);assert.deepEqual(next.positions.b,moved.positions.b);assert.deepEqual(next.positions.c,{x:300,y:20,width:400*1600/900,height:400});assert.deepEqual(next.canvas,DEFAULT_CANVAS);
});
test('all four modes retain fixed bounds and proportional preset arrangements never auto-crop',()=>{
 const images=[image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)],p=appendFixedImages(project(),images);
 assert.ok(p.positions.d.x+p.positions.d.width>p.canvas.width,'right append may cross the fixed boundary');
 for(const type of ['horizontal','vertical','grid','free']){
  const next=arrangeImages(p,type),layout=calculateLayout(next);assert.deepEqual(next.canvas,p.canvas);assert.equal(layout.rects.length,4);
  for(const rect of layout.rects){assert.equal(rect.crop,null);assert.ok(!rect.autoCrop);const source=images.find(i=>i.id===rect.id);assert.ok(Math.abs(rect.width/rect.height-source.width/source.height)<1e-12);if(type!=='free'){assert.ok(rect.x>=-1e-9&&rect.y>=-1e-9);assert.ok(rect.x+rect.width<=layout.width+1e-9&&rect.y+rect.height<=layout.height+1e-9);}}
 }
 const horizontal=arrangeImages(p,'horizontal');assert.ok(horizontal.positions.a.y>0,'confirmed transparent space fits the complete row');
});
test('tight grid has no empty cells within each row and rejects impossible row/column counts atomically',()=>{
 const p=appendFixedImages(project(),[image('a',3,4),image('b',9,16),image('c',3,2)]),next=arrangeImages(p,'grid');
 assert.ok(Math.abs(next.positions.a.width+next.positions.b.width-next.positions.c.width)<1e-9);assert.equal(next.positions.a.height,next.positions.b.height);
 assert.throws(()=>arrangeImages(p,'grid',{rows:4,columns:2}),/行列/);assert.throws(()=>arrangeImages(p,'grid',{rows:1,columns:2}),/行列/);assert.deepEqual(p.grid,{rows:2,columns:2});
});
test('moving, stretching, reordering and editing canvas dimensions never derive new bounds from images',()=>{
 const p=appendFixedImages(project(),[image('a',100,100),image('b',200,100)]);
 p.positions.a={x:-5000,y:10000,width:8000,height:1000};
 const layout=calculateLayout(p);assert.deepEqual([layout.width,layout.height],[5995,2398]);assert.deepEqual([layout.rects[0].x,layout.rects[0].y,layout.rects[0].width,layout.rects[0].height],[-5000,10000,8000,1000]);
 const resized={...p,images:moveImage(p.images,'a','b'),canvas:{width:2000,height:1000}},r=calculateLayout(resized);assert.deepEqual([r.width,r.height],[2000,1000]);assert.deepEqual(resized.positions,p.positions);assert.deepEqual(r.rects.map(i=>i.id),['b','a']);
});
test('canvas edge and ratio limits block actual rendering while invalid settings remain recoverable',()=>{
 for(const canvas of [{width:6000,height:2400},{width:5999,height:2399},{width:0,height:100},{width:100.2,height:100}]){
  const p={...project(),canvas};assert.throws(()=>calculateLayout(p),/画布/);assert.ok(calculateLayout(p,{draft:true}).width>0);assert.deepEqual(p.canvas,canvas);
 }
 for(const canvas of [{width:5999,height:2400},{width:2400,height:5999},{width:1,height:1}])assert.doesNotThrow(()=>calculateLayout({...project(),canvas}));
});
test('manual crop and reset preserve nonuniform source scale, centre, canvas and original order',()=>{
 const a=image('a',200,100),b=image('b',100,100),p=appendProjectImages(project(),[a,b]);p.positions.a={x:-10,y:30,width:400,height:300};
 const cropped=setImageEdit(p,'a',{axis:'horizontal',amount:20});assert.deepEqual(cropped.positions.a,{x:30,y:30,width:320,height:300});
 const reset=resetProject({...cropped,images:[b,a]});assert.deepEqual(reset.positions.a,p.positions.a);assert.deepEqual(reset.canvas,p.canvas);assert.deepEqual(reset.images,[a,b]);assert.deepEqual(reset.edits,{});
});
test('one-click follows the current canvas ratio without changing its dimensions',()=>{
 const p=appendFixedImages({...project(),canvas:{width:2000,height:1000},export:{longEdge:2000}},[image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)]),next=optimizeHorizontal(p);
 assert.deepEqual(next.canvas,p.canvas);assert.deepEqual(next.export,p.export);assert.deepEqual(next.edits.c.edges,{left:100,right:100,top:960,bottom:0});assert.ok(['a','b','d'].every(id=>Math.abs(next.edits[id].fraction-107/594)<1e-12));
 const layout=calculateLayout(next);assert.ok(Math.abs(layout.rects[0].y)<1e-9);assert.equal(optimizeHorizontal(next),next);
 const defaultOptimized=optimizeHorizontal({...p,canvas:{...DEFAULT_CANVAS}}),r=calculateLayout(defaultOptimized);assert.deepEqual([r.width,r.height],[5995,2398]);assert.ok(Math.abs(r.rects[0].y)<1e-9);
});
test('migration preserves legacy visible layout, dimensions, explicit crops and import order once',()=>{
 const images=[image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)],legacy={...project(images),canvasMode:undefined,export:{longEdge:5999}},before=calculateLayout(legacy),migrated=migrateFixedCanvas(legacy),after=calculateLayout(migrated);
 assert.deepEqual(migrated.canvas,{width:before.width,height:before.height});assert.deepEqual(migrated.initialOrder,legacy.initialOrder);assert.deepEqual(migrated.images,images);
 for(const rect of before.rects)assert.deepEqual(migrated.positions[rect.id],{x:rect.x,y:rect.y,width:rect.width,height:rect.height});
 assert.ok(after.rects.slice(2).every(r=>r.proportionalCrop));assert.equal(migrateFixedCanvas(migrated),migrated);assert.deepEqual(legacy.edits,{});
 const empty=migrateFixedCanvas({...legacy,images:[],initialOrder:[]});assert.deepEqual(empty.canvas,DEFAULT_CANVAS);
 const invalid=migrateFixedCanvas({...legacy,layout:'grid',grid:{rows:20,columns:1}});assert.equal(invalid.images.length,4);assert.equal(invalid.layout,'grid');assert.equal(Object.keys(invalid.positions).length,4);assert.throws(()=>calculateLayout(invalid),/行列/);assert.equal(calculateLayout(invalid,{draft:true}).rects.length,4);
});
test('optimization availability compares complete originals to the custom canvas ratio and invalid canvases stay disabled',()=>{
 const p=appendProjectImages({...project(),canvas:{width:2000,height:1000}},[image('a',1000,1000),image('b',1000,1000),image('c',1000,1000)]);
 assert.equal(optimizationAvailability(p).enabled,true);const optimized=optimizeHorizontal(p);assert.equal(optimizationAvailability(optimized).enabled,false);
 assert.equal(optimizationAvailability({...optimized,canvas:{width:1500,height:1000}}).enabled,true,'a newly narrower canvas requires a new original-based crop');
 assert.equal(optimizationAvailability({...p,images:p.images.slice(0,2)}).enabled,false,'matching original ratio needs no crop');
 assert.equal(optimizationAvailability({...p,canvas:{width:6000,height:2400}}).enabled,false);assert.equal(optimizationAvailability({...p,layout:'vertical'}).enabled,false);
});
test('pose metadata cannot override approved image identity, assets or crop policy',()=>{
 const p=appendProjectImages(project(),[image('original',100,100)]);p.positions.original={...p.positions.original,id:'other',assetId:'other-asset',autoCrop:true,crop:{left:.4,right:.4}};
 const rect=calculateLayout(p).rects[0];assert.equal(rect.id,'original');assert.equal(rect.assetId,'original');assert.equal(rect.crop,null);assert.equal(rect.autoCrop,undefined);assert.throws(()=>calculateLayout({...p,layout:'unknown'}),/布局类型/);
});
