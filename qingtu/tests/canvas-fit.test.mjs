import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fitCanvasToContent} from '../engine/canvas-fit.mjs';
import {importCanvasImages} from '../engine/canvas-import.mjs';
import {rememberCanvasLayout,switchCanvasLayout,validateLayoutStates} from '../engine/canvas-layout-state.mjs';
import {calculateLayout} from '../engine/stitch-layout.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {composeProject} from '../engine/stitch-service.mjs';
const image=(id,width=300,height=400)=>({id,assetId:id,width,height,bytes:100});
const project=()=>({id:'fit',canvasMode:'fixed',canvasSizing:'content',canvas:{width:5995,height:2398},layout:'horizontal',images:[],initialOrder:[],positions:{},edits:{},grid:{rows:2,columns:2},export:{format:'png',longEdge:5999,targetBytes:10000000}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('each import derives canvas from complete visible content and uses the requested long edge',()=>{
 const first=importCanvasImages(project(),[image('a')]);assert.deepEqual(first.canvas,{width:4499,height:5999});assert.equal(first.positions.a.x,0);assert.equal(first.positions.a.y,0);near(first.positions.a.width/first.positions.a.height,.75);
 const second=importCanvasImages(first,[image('b')]);assert.deepEqual(second.canvas,{width:5999,height:3999});near(second.positions.b.x,second.positions.a.width);near(second.positions.a.height,second.positions.b.height);assert.deepEqual(second.initialOrder,['a','b']);assert.deepEqual(first.images.map(i=>i.id),['a']);
});
test('imports override a manually chosen canvas, while later movement and resize never refit',()=>{
 const p=importCanvasImages({...project(),canvasSizing:'manual',canvas:{width:1200,height:480},export:{longEdge:1200}},[image('a',100,100),image('b',100,100)]);assert.deepEqual(p.canvas,{width:1200,height:600});assert.equal(p.canvasSizing,'content');
 const moved=rememberCanvasLayout({...p,positions:{...p.positions,a:{x:-200,y:50,width:1100,height:700}}});assert.deepEqual(moved.canvas,p.canvas);assert.equal(calculateLayout(moved).rects[0].x,-200);
 const next=importCanvasImages(moved,[image('c',100,100)]);assert.equal(next.positions.a.x,0);assert.notDeepEqual(next.canvas,moved.canvas);const scale=next.positions.a.width/1100;near(next.positions.a.height/700,scale);near(next.positions.b.x-next.positions.a.x,(p.positions.b.x+200)*scale);
});
test('first automatic layout fits its content, while remembered layouts restore their own canvas and poses',()=>{
 let p=rememberCanvasLayout(importCanvasImages(project(),[image('a',100,100),image('b',100,100)]));const row=p;
 p=switchCanvasLayout(p,'vertical');assert.deepEqual(p.canvas,{width:3000,height:5999});const column=p;p=switchCanvasLayout(p,'grid');assert.deepEqual(p.canvas,column.canvas);
 p=switchCanvasLayout(p,'horizontal');assert.deepEqual(p.canvas,row.canvas);assert.deepEqual(p.positions,row.positions);p=switchCanvasLayout(p,'vertical');assert.deepEqual(p.canvas,column.canvas);assert.deepEqual(p.positions,column.positions);
 const manual=rememberCanvasLayout({...p,canvasSizing:'manual',canvas:{width:900,height:600}});p=switchCanvasLayout(manual,'free');assert.deepEqual(p.canvas,manual.canvas);p=switchCanvasLayout(p,'vertical');assert.deepEqual(p.canvas,manual.canvas);
});
test('a new import refits every visited layout without loading images or losing relative edits',()=>{
 let p=importCanvasImages(project(),[image('a',100,100),image('b',100,100)]);p=switchCanvasLayout(p,'vertical');p=switchCanvasLayout(p,'horizontal');p=importCanvasImages(p,[image('c',100,100)]);validateLayoutStates(p);
 const column=switchCanvasLayout(p,'vertical');assert.equal(column.images.length,3);assert.deepEqual(column.canvas,{width:5999,height:5999});near(column.positions.c.x,column.positions.a.x+column.positions.a.width);near(column.positions.b.y-column.positions.a.y,column.positions.a.height);assert.doesNotThrow(()=>calculateLayout(column));
});
test('over-limit content remains intact and editable with an explicit export error, without crop or ratio padding',()=>{
 const p=importCanvasImages(project(),[image('a'),image('b'),image('c',9,16),image('d',9,16)]);assert.ok(p.canvas.width/p.canvas.height>2.5);assert.deepEqual(p.edits,{});assert.equal(p.images.length,4);assert.throws(()=>calculateLayout(p),/比例超过 2.5/);const draft=calculateLayout(p,{draft:true});assert.ok(draft.rects.every(r=>r.crop===null));near(draft.rects.at(-1).x+draft.rects.at(-1).width,p.canvas.width);
});
test('fitting keeps explicit crop state, source scales and interior gaps, and strict 5:2 remains exact',()=>{
 let p=importCanvasImages(project(),[image('a',200,100)]);p=setImageEdit(p,'a',{axis:'horizontal',amount:20});const before=structuredClone(p);p=fitCanvasToContent(p);assert.deepEqual(p.edits,before.edits);assert.deepEqual(p.images,before.images);near(p.positions.a.width/p.positions.a.height,1.6);
 const exact=importCanvasImages(project(),[image('a',250,100)]);assert.deepEqual(exact.canvas,{width:5995,height:2398});
 const gap=fitCanvasToContent({...project(),images:[image('a',100,100),image('b',100,100)],positions:{a:{x:-50,y:0,width:100,height:100},b:{x:75,y:0,width:100,height:100}}});near(gap.positions.b.x-(gap.positions.a.x+gap.positions.a.width),gap.positions.a.width*.25);
});
test('actual fitted composition has no outer padding, and later overflow still clips at the unchanged canvas',async()=>{
 const red=await sharp({create:{width:100,height:100,channels:4,background:'red'}}).png().toBuffer(),blue=await sharp({create:{width:100,height:100,channels:4,background:'blue'}}).png().toBuffer();
 let p=importCanvasImages({...project(),export:{longEdge:200}},[{...image('a',100,100),bytes:red.length},{...image('b',100,100),bytes:blue.length}]);assert.deepEqual(p.canvas,{width:200,height:100});const store={readAsset:async id=>id==='a'?red:blue};let r=await composeProject(p,store);for(let n=3;n<r.data.length;n+=4)assert.equal(r.data[n],255);
 p={...p,positions:{...p.positions,a:{...p.positions.a,x:-50}}};r=await composeProject(p,store);assert.deepEqual([r.info.width,r.info.height],[200,100]);assert.deepEqual([...r.data.subarray(0,4)],[255,0,0,255]);assert.deepEqual([...r.data.subarray(60*4,60*4+4)],[0,0,0,0]);assert.deepEqual([...r.data.subarray(199*4,200*4)],[0,0,255,255]);
});
