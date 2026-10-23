import test from 'node:test';
import assert from 'node:assert/strict';
import * as configuration from '../engine/optimization-settings.mjs';
const {optimizationSettings}=configuration;
const optimizationImageCrops=(...args)=>configuration.optimizationImageCrops(...args);
import {optimizationEdits,optimizeHorizontal,optimizationAvailability} from '../engine/stitch-optimize.mjs';
import {imageGeometry} from '../engine/stitch-edits.mjs';
const images=[{id:'a',width:3072,height:4096},{id:'b',width:3072,height:4096},{id:'c',width:2160,height:3840},{id:'d',width:2160,height:3840}];
const specialCrops={a:{enabled:true,topPercent:10,sidePixels:50},d:{enabled:true,topPercent:20,sidePixels:150}};

test('multiple image-specific cuts remain exact while all other images share a canvas-filling crop',()=>{
 const project={layout:'horizontal',images,edits:{},export:{longEdge:5995},optimization:{specialCrops}},before=structuredClone(project),next=optimizeHorizontal(project);
 assert.deepEqual(next.edits.a.edges,{left:50,right:50,top:410,bottom:0});assert.deepEqual(next.edits.d.edges,{left:150,right:150,top:768,bottom:0});
 assert.equal(next.edits.b.fraction,next.edits.c.fraction);assert.ok(next.edits.b.fraction>0);
 const total=images.reduce((sum,image)=>{const rect=imageGeometry(image,next.edits[image.id]);return sum+rect.width/rect.height;},0);assert.ok(Math.abs(total-2.5)<1e-12);
 assert.equal(optimizeHorizontal(next),next);assert.equal(optimizationAvailability(next).enabled,false);assert.deepEqual(project,before);
 const reordered=optimizationEdits([images[3],images[1],images[2],images[0]],2.5,{specialCrops});assert.deepEqual(reordered.a,next.edits.a);assert.deepEqual(reordered.d,next.edits.d);
});
test('explicit no selection or disabled records never restore the legacy third-image crop',()=>{
 for(const crops of [{},{a:{enabled:false,topPercent:90,sidePixels:9999}},{missing:{enabled:true,topPercent:99,sidePixels:9999}}]){
  const edits=optimizationEdits(images,2.5,{specialCrops:crops});for(const image of images){assert.equal(edits[image.id].edges,undefined);assert.ok(Math.abs(edits[image.id].fraction-1/42)<1e-12);}
 }
});
test('valid image IDs that match object property names retain their own crop or uniform fallback',()=>{
 const pair=[{id:'toString',width:1000,height:1000},{id:'constructor',width:2000,height:1000}];
 const edits=optimizationEdits(pair,2,{specialCrops:{constructor:{enabled:true,topPercent:0,sidePixels:250}}});
 assert.deepEqual(edits.toString,{axis:'horizontal',fraction:.25});assert.deepEqual(edits.constructor.edges,{left:250,right:250,top:0,bottom:0});
});
test('legacy selection migrates to the actual image with its saved parameters; new defaults remain third/15 percent',()=>{
 assert.deepEqual(optimizationImageCrops(undefined,images),{c:{enabled:true,topPercent:15,sidePixels:100}});
 assert.deepEqual(optimizationImageCrops({imageNumber:4,topPercent:25,sidePixels:60},images),{d:{enabled:true,topPercent:25,sidePixels:60}});
 assert.deepEqual(optimizationImageCrops({imageNumber:null},images),{});assert.deepEqual(optimizationImageCrops(undefined,images.slice(0,2)),{});assert.deepEqual(optimizationImageCrops(undefined,[]),{});
 assert.deepEqual(optimizationImageCrops({specialCrops},[images[3],images[0]]),specialCrops);
 assert.deepEqual(optimizationImageCrops({specialCrops:{...specialCrops,deleted:{enabled:true,topPercent:5,sidePixels:0}}},images),specialCrops);
});
test('each stored crop is independently validated, including disabled records',()=>{
 const normalized=optimizationSettings({specialCrops:{a:{topPercent:12.5,sidePixels:0},b:{enabled:false,topPercent:0,sidePixels:7}}});
 assert.deepEqual(normalized.specialCrops,{a:{enabled:true,topPercent:12.5,sidePixels:0},b:{enabled:false,topPercent:0,sidePixels:7}});
 for(const crops of [null,[],{a:null},{a:{enabled:'yes'}},{a:{topPercent:100}},{a:{sidePixels:1.5}},{'../bad':{enabled:true}},Object.fromEntries(Array.from({length:101},(_,i)=>['id'+i,{}]))])assert.throws(()=>optimizationSettings({specialCrops:crops}),/裁剪|设置|图片/);
});
test('all selected images must match the canvas exactly, and impossible individual crops never modify sources',()=>{
 const pair=[{id:'a',width:1600,height:1000},{id:'b',width:1100,height:1000}],options={specialCrops:{a:{enabled:true,topPercent:0,sidePixels:50},b:{enabled:true,topPercent:0,sidePixels:50}}};
 assert.deepEqual(optimizationEdits(pair,2.5,options),{a:{edges:{left:50,right:50,top:0,bottom:0},links:{horizontal:true,vertical:false}},b:{edges:{left:50,right:50,top:0,bottom:0},links:{horizontal:true,vertical:false}}});
 assert.throws(()=>optimizationEdits(pair,2.4,options),/无法匹配画布/);
 for(const cuts of [{...specialCrops,a:{enabled:true,topPercent:100,sidePixels:0}},{...specialCrops,a:{enabled:true,topPercent:0,sidePixels:1536}},{a:{enabled:true,topPercent:90,sidePixels:0},d:specialCrops.d}]){
  const before=structuredClone(images);assert.throws(()=>optimizationEdits(images,2.5,{specialCrops:cuts}));assert.deepEqual(images,before);
 }
});

test('narrow ordinary images crop vertically while the selected special crop remains exact',()=>{
 const sources=[{id:'a',width:60,height:100},{id:'b',width:60,height:100},{id:'c',width:100,height:100}],options={specialCrops:{c:{enabled:true,topPercent:20,sidePixels:10}}};
 const before=structuredClone(sources),edits=optimizationEdits(sources,2.5,options);
 assert.deepEqual(edits.c,{edges:{left:10,right:10,top:20,bottom:0},links:{horizontal:true,vertical:false}});
 for(const id of ['a','b']){const geometry=imageGeometry(sources.find(i=>i.id===id),edits[id]);assert.ok(Math.abs(geometry.top-10)<1e-9);assert.ok(Math.abs(geometry.height-80)<1e-9);assert.equal(geometry.width,60);}
 assert.deepEqual(sources,before);
});
