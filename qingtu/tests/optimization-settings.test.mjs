import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizationSettings} from '../engine/optimization-settings.mjs';
import {optimizeHorizontal,optimizationAvailability} from '../engine/stitch-optimize.mjs';
import {imageGeometry} from '../engine/stitch-edits.mjs';
const images=[{id:'a',width:3072,height:4096},{id:'b',width:3072,height:4096},{id:'c',width:2160,height:3840},{id:'d',width:2160,height:3840}];
const project=()=>({layout:'horizontal',images,export:{longEdge:5995},edits:{}});

test('optimization defaults are 25 percent and 100 source pixels per side; zero cuts and fractional percentages are explicit',()=>{
 assert.deepEqual(optimizationSettings(),{topPercent:25,sidePixels:100});
 assert.deepEqual(optimizationSettings({topPercent:0,sidePixels:0}),{topPercent:0,sidePixels:0});
 assert.deepEqual(optimizationSettings({topPercent:12.5}),{topPercent:12.5,sidePixels:100});
 for(const invalid of [{topPercent:100},{topPercent:-1},{topPercent:NaN},{sidePixels:1.5},{sidePixels:-1},{sidePixels:Infinity},[],'25'])assert.throws(()=>optimizationSettings(invalid),/裁剪|设置/);
});
test('each canvas keeps its optimization parameters; changing them waits for explicit optimization and enables recalculation',()=>{
 const original=project(),before=structuredClone(original),first=optimizeHorizontal(original);
 assert.deepEqual(first.edits.c.edges,{left:100,right:100,top:960,bottom:0});assert.deepEqual(original,before);
 const changed={...first,optimization:{topPercent:20,sidePixels:150}};
 assert.deepEqual(changed.edits,first.edits,'parameter changes alone preserve the applied crop');assert.equal(optimizationAvailability(changed).enabled,true);
 const next=optimizeHorizontal(changed);assert.deepEqual(next.edits.c.edges,{left:150,right:150,top:768,bottom:0});assert.deepEqual(next.optimization,changed.optimization);
 assert.equal(optimizeHorizontal(next),next);assert.equal(optimizationAvailability(next).enabled,false);
 assert.deepEqual(first.optimization,{topPercent:25,sidePixels:100});assert.deepEqual(first.edits.c.edges,{left:100,right:100,top:960,bottom:0});
 const ratio=images.reduce((sum,image)=>{const r=imageGeometry(image,next.edits[image.id]);return sum+r.width/r.height;},0);assert.ok(Math.abs(ratio-2.5)<1e-12);
 for(const id of ['a','b','d'])assert.equal(next.edits[id].fraction,next.edits.a.fraction);
 const zero=optimizeHorizontal({...project(),optimization:{topPercent:0,sidePixels:0}});assert.deepEqual(zero.edits.c.edges,{left:0,right:0,top:0,bottom:0});
 const decimal=optimizeHorizontal({...project(),optimization:{topPercent:12.5,sidePixels:80}});assert.deepEqual(decimal.edits.c.edges,{left:80,right:80,top:480,bottom:0});
});
test('impossible third-image cuts disable optimization without altering any original state',()=>{
 for(const optimization of [{topPercent:99.999,sidePixels:100},{topPercent:25,sidePixels:1080},{topPercent:90,sidePixels:0}]){
  const p={...project(),optimization},before=structuredClone(p);assert.equal(optimizationAvailability(p).enabled,false);assert.throws(()=>optimizeHorizontal(p));assert.deepEqual(p,before);
 }
});
