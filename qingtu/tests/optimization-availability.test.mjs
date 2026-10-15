import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizationAvailability,optimizeHorizontal} from '../engine/stitch-optimize.mjs';
import {importCanvasImages} from '../engine/canvas-import.mjs';
import {applyCanvasTransform,resizeImageRect} from '../engine/canvas-transform.mjs';

test('fixed optimization becomes available again after proportional zoom, shrink, Shift stretch or position changes',()=>{
 const four=[{id:'a',width:3072,height:4096},{id:'b',width:3072,height:4096},{id:'c',width:2160,height:3840},{id:'d',width:2160,height:3840}],two=[{id:'a',width:6144,height:4096},{id:'b',width:4320,height:3840}];
 for(const images of [four,two])for(const canvasSizing of ['content','manual']){
  const imported=importCanvasImages({images:[],initialOrder:[],canvasMode:'fixed',heightLocked:true,canvasSizing,canvas:{width:600,height:240},layout:'horizontal',positions:{},edits:{},export:{format:'png',longEdge:600,targetBytes:10000000}},images);
  const optimized=optimizeHorizontal({...imported,canvasSizing});assert.equal(optimizationAvailability(optimized).enabled,false);
  for(const [handle,dx,dy,shift] of [['se',35,45,false],['se',-25,-30,false],['e',35,0,true]]){
   const resized=applyCanvasTransform(optimized,{...optimized.positions,a:resizeImageRect(optimized.positions.a,handle,dx,dy,shift)},'resize'),before=structuredClone(resized);
   assert.deepEqual(resized.edits,optimized.edits);assert.equal(optimizationAvailability(resized).enabled,true,`${canvasSizing} ${handle} ${dx} ${shift}`);assert.deepEqual(resized,before,'availability is read-only');
   const result=optimizeHorizontal(resized);assert.equal(optimizationAvailability(result).enabled,false);assert.equal(optimizeHorizontal(result),result);assert.deepEqual(result.canvas,resized.canvas);assert.deepEqual(result.export,resized.export);assert.deepEqual(result.images,resized.images);assert.deepEqual(result.importSizes,resized.importSizes);
   let x=0;for(const image of result.images){const pose=result.positions[image.id];assert.ok(Math.abs(pose.x-x)<1e-9);assert.ok(Math.abs(pose.y)<1e-9);assert.ok(Math.abs(pose.height-result.canvas.height)<1e-9);x+=pose.width;}assert.ok(Math.abs(x-result.canvas.width)<1e-9);
  }
  const moved={...optimized,positions:{...optimized.positions,a:{...optimized.positions.a,x:optimized.positions.a.x+8,y:12}}};assert.equal(optimizationAvailability(moved).enabled,true);assert.deepEqual(optimizeHorizontal(moved).positions,optimized.positions);
  assert.equal(optimizationAvailability({...optimized,optimization:{...optimized.optimization},name:'renamed'}).enabled,false,'metadata-only changes need no new optimization');
 }
});
const image=(id,width,height)=>({id,width,height});
const project=images=>({images,layout:'horizontal',export:{longEdge:5999}});
test('optimization is unavailable for empty, non-horizontal and original ratios at or below 2.5',()=>{
 assert.equal(optimizationAvailability(null).enabled,false);assert.equal(optimizationAvailability(project([])).enabled,false);
 for(const images of [[image('one',300,400)],[image('one',5,2)],[image('one',3,4),image('two',7,4)]])assert.equal(optimizationAvailability(project(images)).enabled,false);
 for(const layout of ['vertical','grid','free'])assert.equal(optimizationAvailability({...project([image('one',3,1)]),layout}).enabled,false);
});
test('the original 2.625 example stays eligible despite the existing automatic 9:16 crop; a ready equal crop disables further optimization',()=>{
 const original=project([image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)]),before=structuredClone(original);
 assert.equal(optimizationAvailability(original).enabled,true);assert.deepEqual(original,before);
 const optimized=optimizeHorizontal(original);assert.equal(optimizationAvailability(optimized).enabled,false);
 assert.equal(optimizationAvailability({...optimized,edits:Object.fromEntries(original.images.map(image=>[image.id,{axis:'horizontal',fraction:1/42}]))}).enabled,true,'the former uniform crop can adopt the new third-image default');
 assert.equal(optimizationAvailability({...optimized,images:[...optimized.images].reverse()}).enabled,true,'changing the current third image requires a fresh crop');
 assert.equal(optimizationAvailability({...optimized,edits:{}}).enabled,true,'reset crops allows recalculation');
});
test('user edits can be recomputed from originals while sub-pixel crops are unavailable',()=>{
 const original=project([image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)]);
 assert.equal(optimizationAvailability({...original,edits:{a:{axis:'horizontal',amount:1}}}).enabled,true);
 assert.equal(optimizationAvailability(project([image('a',1,1),image('b',100,1)])).enabled,false);
});
