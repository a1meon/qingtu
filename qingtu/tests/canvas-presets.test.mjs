import test from 'node:test';
import {importCanvasImages} from '../engine/canvas-import.mjs';
import {calculateLayout} from '../engine/stitch-layout.mjs';
import {splitProjectImage} from '../engine/stitch-split.mjs';
import assert from 'node:assert/strict';
import {currentCanvasPreset,selectCanvasPreset,editCanvasDimension,toggleCanvasRatio,originalCanvas} from '../engine/canvas-presets.mjs';

function single(width=720,height=500){
 return {canvas:{width,height},canvasSizing:'content',images:[{id:'layer',assetId:'source',width,height}],export:{format:'png'}};
}

test('original and remembered custom frames survive switching presets and reopening',()=>{
 let project=single(800,600);
 assert.equal(currentCanvasPreset(project),'original');
 project=selectCanvasPreset(project,'4:3');
 assert.equal(currentCanvasPreset(project),'4:3');
 project=selectCanvasPreset(project,'custom');
 assert.deepEqual(project.canvas,{width:800,height:600});
 project=editCanvasDimension(project,'width',400);
 project=selectCanvasPreset(project,'12:5');
 project=selectCanvasPreset(JSON.parse(JSON.stringify(project)),'original');
 assert.deepEqual(project.canvas,{width:800,height:600});
 project=selectCanvasPreset(project,'custom');
 assert.deepEqual(project.canvas,{width:400,height:300});
 assert.equal(currentCanvasPreset(project),'custom');
 const blank={...single(),images:[],canvas:{width:480,height:320}};
 const incomplete=editCanvasDimension(blank,'width','');
 assert.deepEqual(selectCanvasPreset(selectCanvasPreset(incomplete,'1:1'),'custom').canvas,blank.canvas);
 const legacy={...single(),canvasSizing:'manual',canvas:{width:550,height:340}};
 assert.deepEqual(selectCanvasPreset(selectCanvasPreset(legacy,'1:1'),'custom').canvas,legacy.canvas);
});

test('both anchors share a stable ratio during typing; unlock and relock use the current frame',()=>{
 let p=single();
 for(const value of ['',3,36,360])p=editCanvasDimension(p,'width',value);
 assert.deepEqual(p.canvas,{width:360,height:250});
 p=editCanvasDimension(p,'height',500);
 assert.deepEqual(p.canvas,{width:720,height:500});
 p=editCanvasDimension(toggleCanvasRatio(p),'width',500);
 assert.deepEqual(p.canvas,{width:500,height:500});
 p=editCanvasDimension(toggleCanvasRatio(p),'height',6500);
 assert.deepEqual(p.canvas,{width:5999,height:5999});
 p=editCanvasDimension(selectCanvasPreset(p,'12:5'),'width',8);
 assert.deepEqual(p.canvas,{width:8,height:4});
});

test('original means the complete oriented import, including after splitting or turning a layer',()=>{
 const p=single(6400,4000);
 assert.deepEqual(originalCanvas(p),{width:5999,height:3749});
 const layer={id:'left',assetId:'source',rotation:90,width:2000,height:4000,source:{fullWidth:4000,fullHeight:6400}};
 assert.deepEqual(originalCanvas({...p,images:[layer,{...layer,id:'right'}]}),originalCanvas(p));

 assert.equal(originalCanvas({...p,images:[]}),null);
});

function importRow(images){
 const blank={canvasMode:'fixed',layout:'horizontal',canvas:{width:240,height:100},heightLocked:true,canvasSizing:'content',images:[],positions:{},export:{format:'png'}};
 return importCanvasImages(blank,images.map(([assetId,width,height],i)=>({id:'layer-'+i,assetId,width,height,bytes:100})));
}

test('original preset restores the entire mixed-source row after resizing and reopening',()=>{
 const imported=importRow([['a',40,100],['b',80,100],['c',100,200]]);
 assert.equal(currentCanvasPreset(imported),'original');
 const square=selectCanvasPreset(imported,'1:1');
 for(const rect of calculateLayout(square).rects){
  assert.equal(rect.y,0);
  assert.equal(rect.height,5999);
 }
 const restored=selectCanvasPreset(JSON.parse(JSON.stringify(square)),'original');
 assert.deepEqual(restored.canvas,{width:170,height:100});
 assert.deepEqual(calculateLayout(restored).rects.map(({x,y,width,height})=>[x,y,width,height]),[[0,0,40,100],[40,0,80,100],[120,0,50,100]]);
});

test('a repeated asset contributes once per import and a wide original shows every layer',()=>{
 const imported=importRow([['a',90,100],['a',90,100],['a',90,100]]);
 const restored=selectCanvasPreset(selectCanvasPreset(imported,'16:9'),'original');
 assert.deepEqual(restored.canvas,{width:270,height:100});
 assert.deepEqual(calculateLayout(restored).rects.map(({x,width,height})=>[x,width,height]),[[0,90,100],[90,90,100],[180,90,100]]);
});

test('switching ratio keeps a vertical split registered to its sibling and counts their import only once',()=>{
 const imported=importRow([['a',60,100],['b',70,100]]);
 const split=splitProjectImage(imported,'layer-0','y',40,['top','bottom']);
 const restored=selectCanvasPreset(selectCanvasPreset(split,'4:3'),'original');
 assert.deepEqual(restored.canvas,{width:130,height:100});
 for(const id of ['top','bottom','layer-1']){
  const pose=restored.positions[id];
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(pose[key]-split.positions[id][key])<1e-8);
 }
});

test('limiting a composite to 5999 pixels rounds only once and covers the entire raster',()=>{
 const imported=importRow([['a',100,100],['b',100,100],['c',50,100]]);
 const importSizes=Object.fromEntries(imported.images.map(image=>[image.id,{width:image.width*24.95,height:2495}]));
 const restored=selectCanvasPreset({...imported,importSizes},'original');
 assert.deepEqual(restored.canvas,{width:5999,height:2400});
 const rects=calculateLayout(restored).rects;
 assert.equal(rects[0].x,0);
 assert.equal(rects[2].x+rects[2].width,5999);
 for(const rect of rects){assert.equal(rect.y,0);assert.equal(rect.height,2400);}
});
