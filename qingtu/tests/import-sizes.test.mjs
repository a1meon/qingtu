import test from 'node:test';
import assert from 'node:assert/strict';
import {importCanvasImages} from '../engine/canvas-import.mjs';
import {validateImportSizes} from '../engine/import-sizes.mjs';
import {splitProjectImage} from '../engine/stitch-split.mjs';
import {removeProjectImage,resetProject} from '../engine/stitch-reset.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {switchCanvasLayout,rememberCanvasLayout} from '../engine/canvas-layout-state.mjs';
const image=(id,width,height)=>({id,width,height,assetId:id,bytes:100});
const project=()=>({id:'import-size-test',images:[],initialOrder:[],canvasMode:'fixed',heightLocked:true,canvasSizing:'content',canvas:{width:600,height:240},layout:'horizontal',positions:{},edits:{},export:{longEdge:600}});
test('actual import sizes survive resizing and later imports at a different canvas height',()=>{
 const first=importCanvasImages(project(),[image('a',3000,4000)]);assert.deepEqual(first.importSizes.a,{width:180,height:240});
 const enlarged={...first,canvas:{width:600,height:300},positions:{a:{x:0,y:0,width:360,height:480}}},next=importCanvasImages(enlarged,[image('b',900,1600)]);
 assert.deepEqual(next.importSizes.a,{width:180,height:240});assert.deepEqual(next.importSizes.b,{width:168.75,height:300});assert.deepEqual(next.positions.a,enlarged.positions.a);validateImportSizes(next);
});
test('split pieces inherit proportional import sizes rather than the current enlarged pose; deleting removes only its record',()=>{
 let p=importCanvasImages(project(),[image('a',3000,4000)]);p={...p,positions:{a:{x:0,y:0,width:360,height:480}}};
 p=splitProjectImage(p,'a','y',1000,['top','bottom']);assert.deepEqual(p.importSizes,{top:{width:180,height:60},bottom:{width:180,height:180}});assert.equal(p.positions.top.height,120);
 p=splitProjectImage(p,'bottom','x',1000,['left','right']);assert.deepEqual(p.importSizes.left,{width:60,height:180});assert.deepEqual(p.importSizes.right,{width:120,height:180});
 p=removeProjectImage(p,'left');assert.equal(p.importSizes.left,undefined);assert.deepEqual(p.importSizes.right,{width:120,height:180});validateImportSizes(p);
});
test('legacy size records remain unknown and invalid metadata cannot impersonate image/source fields',()=>{
 const p={images:[image('a',3000,4000)]};assert.doesNotThrow(()=>validateImportSizes(p));
 for(const importSizes of [null,[],{missing:{width:1,height:1}},{a:{width:0,height:1}},{a:{width:Infinity,height:1}},{a:{width:1,height:1,assetId:'other'}}])assert.throws(()=>validateImportSizes({...p,importSizes}),/导入尺寸/);
});

test('free reset undoes stretch and four-edge crops at the current visible centre, even after canvas height changed',()=>{
 let p=importCanvasImages(project(),[image('a',3000,4000),image('b',900,1600)]);
 p={...p,layout:'free',canvasSizing:'manual',canvas:{width:600,height:480},positions:{...p.positions,a:{x:-200,y:120,width:400,height:500}},optimization:{topPercent:20,sidePixels:125}};
 p=setImageEdit(p,'a',{edges:{left:100,right:300,top:1000,bottom:0}});p={...p,images:[p.images[1],p.images[0]]};
 const before=structuredClone(p),pose=p.positions.a,r=resetProject(p);
 assert.deepEqual(r.positions.a,{x:pose.x+pose.width/2-90,y:pose.y+pose.height/2-120,width:180,height:240});
 assert.deepEqual(r.images.map(i=>i.id),['a','b']);assert.deepEqual(r.edits,{});assert.deepEqual(r.canvas,p.canvas);assert.deepEqual(r.optimization,p.optimization);assert.deepEqual(r.export,p.export);assert.deepEqual(p,before);
});

test('horizontal reset restores recorded import sizes and order, reflows and shrinks automatic width',()=>{
 let p=importCanvasImages(project(),[image('a',3000,4000),image('b',900,1600)]);
 p={...p,images:[p.images[1],p.images[0]],positions:{a:{x:400,y:-20,width:360,height:480},b:{x:0,y:15,width:400,height:600}},canvas:{width:600,height:240}};
 const r=resetProject(p);assert.deepEqual(r.positions,{a:{x:0,y:0,width:180,height:240},b:{x:180,y:0,width:135,height:240}});assert.deepEqual(r.canvas,{width:315,height:240});
 const manual=resetProject({...p,canvasSizing:'manual'});assert.deepEqual(manual.canvas,p.canvas);assert.deepEqual(manual.positions,r.positions);
});

test('legacy fallback uses current height without recording an edited size; split pieces keep the full-source scale',()=>{
 let p=importCanvasImages(project(),[image('a',3000,4000)]);delete p.importSizes;p={...p,layout:'free',canvasSizing:'manual',canvas:{width:600,height:400},positions:{a:{x:40,y:50,width:600,height:800}}};
 const r=resetProject(p);assert.deepEqual(r.positions.a,{x:190,y:250,width:300,height:400});assert.equal(r.importSizes,undefined);
 const split=splitProjectImage(p,'a','y',1000,['top','bottom']),reset=resetProject(split);
 assert.equal(reset.positions.top.height,100);assert.equal(reset.positions.bottom.height,300);assert.equal(reset.positions.top.width,300);assert.equal(reset.positions.bottom.width,300);
});

test('all visited layouts reset without reviving stale zoom, and free remembers its current centre',()=>{
 let p=importCanvasImages({...project(),grid:{rows:2,columns:2}},['a','b','c','d'].map(id=>image(id,3000,4000)));
 p=switchCanvasLayout(p,'free');p.positions.a={x:-50,y:70,width:360,height:480};const centre={x:130,y:310};
 p=switchCanvasLayout(p,'grid');p.positions.a={...p.positions.a,width:1000,height:800};p=switchCanvasLayout(p,'vertical');p.positions.a={...p.positions.a,width:800,height:1000};
 p=switchCanvasLayout(p,'horizontal');p.positions.a={x:0,y:0,width:720,height:960};p=resetProject(rememberCanvasLayout(p));
 for(const mode of ['free','grid','vertical','horizontal']){p=switchCanvasLayout(p,mode);assert.deepEqual(p.edits,{});assert.ok(p.positions.a.width<800&&p.positions.a.height<800);if(mode==='free'){assert.equal(p.positions.a.width,180);assert.equal(p.positions.a.height,240);assert.equal(p.positions.a.x+90,centre.x);assert.equal(p.positions.a.y+120,centre.y);}else if(mode==='horizontal')assert.equal(p.positions.b.x,p.positions.a.width);else if(mode==='vertical')assert.equal(p.positions.b.y,p.positions.a.y+p.positions.a.height);else assert.equal(p.positions.b.x,p.positions.a.x+p.positions.a.width);}
});
