import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizationAvailability,optimizeHorizontal} from '../engine/stitch-optimize.mjs';
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
