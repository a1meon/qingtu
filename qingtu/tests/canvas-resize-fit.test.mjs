import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {applyCanvasTransform,resizeImageRect} from '../engine/canvas-transform.mjs';
import {calculateLayout} from '../engine/stitch-layout.mjs';
import {rememberCanvasLayout,switchCanvasLayout} from '../engine/canvas-layout-state.mjs';
import {composeProject} from '../engine/stitch-service.mjs';
const project=()=>({id:'resize-fit',canvasMode:'fixed',canvasSizing:'content',layout:'horizontal',grid:{rows:2,columns:2},images:[{id:'a',assetId:'a',width:200,height:100}],initialOrder:['a'],edits:{},positions:{a:{x:0,y:0,width:400,height:200}},canvas:{width:400,height:200},export:{longEdge:5999,targetBytes:10000000,format:'png'}});

test('automatic canvas grows and shrinks with actual resized image bounds without normalizing back to the export long edge',()=>{
 const p=project(),enlarged=applyCanvasTransform(p,{a:resizeImageRect(p.positions.a,'se',200,100)},'resize');
 assert.deepEqual(enlarged.canvas,{width:600,height:300});assert.deepEqual(enlarged.positions.a,{x:0,y:0,width:600,height:300});
 const shrunk=applyCanvasTransform(enlarged,{a:resizeImageRect(enlarged.positions.a,'nw',300,150)},'resize');
 assert.deepEqual(shrunk.canvas,{width:300,height:150});assert.deepEqual(shrunk.positions.a,{x:0,y:0,width:300,height:150});assert.deepEqual(shrunk.export,p.export);assert.deepEqual(p.canvas,{width:400,height:200});
});

test('resizing fits all images and preserves relative poses, source crops, order and independent Shift scales',()=>{
 const p=project();p.images.push({id:'b',assetId:'b',width:100,height:100});p.initialOrder.push('b');p.edits.a={axis:'horizontal',amount:10};p.positions={a:{x:-20,y:10,width:360,height:200},b:{x:400,y:20,width:200,height:200}};
 const next=applyCanvasTransform(p,{...p.positions,b:resizeImageRect(p.positions.b,'se',-100,-50,true)},'resize');
 assert.deepEqual(next.canvas,{width:520,height:200});assert.deepEqual(next.positions.a,{x:0,y:0,width:360,height:200});assert.deepEqual(next.positions.b,{x:420,y:10,width:100,height:150});assert.deepEqual(next.edits,p.edits);assert.deepEqual(next.images,p.images);assert.deepEqual(next.initialOrder,p.initialOrder);
});

test('manual presets and dimensions stay fixed on resize, while movement keeps editable overflow on an automatic canvas',()=>{
 const p=project(),manual={...p,canvasSizing:'manual',canvas:{width:800,height:320}};
 const resized=applyCanvasTransform(manual,{a:resizeImageRect(p.positions.a,'se',-200,-100)},'resize');assert.deepEqual(resized.canvas,manual.canvas);assert.deepEqual(resized.positions.a,{x:0,y:0,width:200,height:100});
 const moved=applyCanvasTransform(p,{a:{...p.positions.a,x:-80,y:-30}},'move');assert.deepEqual(moved.canvas,p.canvas);assert.equal(calculateLayout(moved).rects[0].x,-80);
 const legacy=applyCanvasTransform({...manual,canvasSizing:undefined},{a:resized.positions.a},'resize');assert.deepEqual(legacy.canvas,manual.canvas);
});

test('resized canvas and poses restore independently per layout and invalid content keeps its data for correction',()=>{
 let p=rememberCanvasLayout(project());p=switchCanvasLayout(p,'free');p=rememberCanvasLayout(applyCanvasTransform(p,{a:{x:0,y:0,width:300,height:150}},'resize'));
 const row=switchCanvasLayout(p,'horizontal');assert.deepEqual(row.canvas,{width:400,height:200});assert.deepEqual(switchCanvasLayout(row,'free').canvas,{width:300,height:150});
 for(const pose of [{x:0,y:0,width:6000,height:3000},{x:0,y:0,width:500,height:100}]){const invalid=applyCanvasTransform(project(),{a:pose},'resize');assert.deepEqual(invalid.positions.a,pose);assert.deepEqual(invalid.canvas,{width:pose.width,height:pose.height});assert.throws(()=>calculateLayout(invalid),/画布/);assert.equal(calculateLayout(invalid,{draft:true}).rects.length,1);}
});

test('PNG composition after shrinking has no stale outer whitespace and manual resize still exports only its chosen frame',async()=>{
 const source=await sharp({create:{width:200,height:100,channels:4,background:{r:80,g:120,b:200,alpha:1}}}).png().toBuffer(),p=project();p.images[0].bytes=source.length;
 const store={readAsset:async()=>source},shrunk=applyCanvasTransform(p,{a:{x:0,y:0,width:200,height:100}},'resize'),r=await composeProject(shrunk,store);
 assert.deepEqual([r.info.width,r.info.height],[200,100]);for(let n=3;n<r.data.length;n+=4)assert.equal(r.data[n],255);
 const manual=applyCanvasTransform({...p,canvasSizing:'manual'},{a:{x:0,y:0,width:200,height:100}},'resize'),m=await composeProject(manual,store);assert.deepEqual([m.info.width,m.info.height],[400,200]);assert.equal(m.data[(199*400+399)*4+3],0);
});
