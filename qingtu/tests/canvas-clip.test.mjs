import test from 'node:test';
import assert from 'node:assert/strict';
import {clipRectangle} from '../engine/canvas-clip.mjs';

test('fixed-canvas intersections keep coordinates and clip every side',()=>{
 const canvas={width:250,height:100};
 assert.deepEqual(clipRectangle({x:10,y:20,width:40,height:30},canvas),{left:10,top:20,width:40,height:30,sourceLeft:0,sourceTop:0});
 assert.deepEqual(clipRectangle({x:-20,y:-10,width:300,height:130},canvas),{left:0,top:0,width:250,height:100,sourceLeft:20,sourceTop:10});
 assert.deepEqual(clipRectangle({x:220,y:80,width:100,height:60},canvas),{left:220,top:80,width:30,height:20,sourceLeft:0,sourceTop:0});
});

test('an image outside the canvas contributes no pixels and cannot extend it',()=>{
 const canvas={width:250,height:100};
 for(const rect of [{x:-80,y:0,width:80,height:100},{x:250,y:0,width:80,height:100},{x:0,y:-100,width:250,height:100},{x:0,y:100,width:250,height:100}])assert.equal(clipRectangle(rect,canvas),null);
 assert.deepEqual(canvas,{width:250,height:100});
 assert.throws(()=>clipRectangle({x:NaN,y:0,width:80,height:100},canvas),/坐标无效/);
});
