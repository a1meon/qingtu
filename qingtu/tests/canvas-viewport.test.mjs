import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasViewport,placeImageControls,placeImagePanel,resizeCanvasViewport} from '../src/stitch/canvas-viewport.js';

test('100% fits the entire imported canvas inside both viewport edges',()=>{
 const bounds={width:400,height:226};
 for(const layout of [{width:1200,height:480},{width:5999,height:500},{width:480,height:1200}]){
  const view=fitCanvasViewport(bounds,layout,{hasImages:true});
  const width=layout.width*view.scale,height=layout.height*view.scale;
  assert.ok(width<=bounds.width-32+1e-9);
  assert.ok(height<=bounds.height-24+1e-9);
  assert.ok(Math.abs(width-(bounds.width-32))<1e-9||Math.abs(height-(bounds.height-24))<1e-9);
  assert.deepEqual([view.offsetX,view.offsetY],[0,0]);
 }
});
test('opening any image editor preserves the canvas scale and position',()=>{
 for(const height of [226,360,556])for(const editor of ['crop','split','rotate']){
  const bounds={width:545,height},layout={width:1200,height:480};
  assert.deepEqual(fitCanvasViewport(bounds,layout,{hasImages:true,editor}),fitCanvasViewport(bounds,layout,{hasImages:true}));
 }
});
test('parameter cards follow the image, then dock near the visible bottom and side edges',()=>{
 const bounds={left:50,top:80,width:550,height:300,windowHeight:650};
 for(const mode of ['crop','split','rotate']){
  const place=(x,y)=>placeImagePanel(bounds,placeImageControls(bounds,{x,y,width:150,height:80},mode).panel,115);
  const natural=place(200,100);
  assert.equal(natural.left+natural.width/2,275);
  assert.equal(natural.top,180+(mode==='rotate'?18:10));
  assert.equal(place(-1000,1400).left,50);
  assert.equal(place(1000,1400).top,384);
  assert.equal(place(1000,1400).left+natural.width,600);
 }
});
test('parameter cards clear navigation and fit the actual window height',()=>{
 const bounds={left:40,top:100,width:600,height:300,windowHeight:640,navigation:{left:500,right:640,top:410,bottom:440}};
 const anchor={left:400,top:700,width:300};
 assert.deepEqual(placeImagePanel(bounds,anchor,130),{left:196,top:404,width:300});
 const narrow={...bounds,width:250,navigation:{...bounds.navigation,left:155,right:290}};
 assert.deepEqual(placeImagePanel(narrow,anchor,130),{left:40,top:444,width:250});
 assert.equal(placeImagePanel(narrow,{...anchor,top:310},130).top,276);
 assert.deepEqual(placeImagePanel({...narrow,windowHeight:490},anchor,130),{left:40,top:276,width:250});
});
test('square canvases and empty canvases keep their aspect and resize in either direction',()=>{
 for(const hasImages of [false,true])for(const bounds of [{width:320,height:226},{width:545,height:360},{width:900,height:600}]){
  const layout={width:5999,height:5999},view=fitCanvasViewport(bounds,layout,{hasImages});
  assert.ok(view.scale>0);if(hasImages)assert.ok(Math.abs(layout.height*view.scale-(bounds.height-24))<1e-9);
  else {assert.ok(layout.width*view.scale<=bounds.width-32+1e-9);assert.ok(layout.height*view.scale<=bounds.height-32+1e-9);}
 }
});

test('a viewport resize cap keeps canvas fit bounded while retaining its centre',()=>{
 const bounds={width:700,height:360},layout={width:1200,height:480},view=fitCanvasViewport(bounds,layout,{maxScale:.2});
 assert.equal(view.scale,.2);assert.equal(view.offsetX,0);assert.equal(view.offsetY,0);
});

test('resize ceilings survive breakpoint callbacks and reset for explicit view changes or viewport growth',()=>{
 let state=resizeCanvasViewport(null,{key:'canvas:open',width:1101,height:700,scale:.08});
 state=resizeCanvasViewport(state,{key:'canvas:open',width:1100,height:700,scale:.1});assert.equal(state.scale,.08);
 state=resizeCanvasViewport(state,{key:'canvas:open',width:1100,height:700,scale:.12});assert.equal(state.scale,.08,'transition callbacks cannot release the ceiling');
 state=resizeCanvasViewport(state,{key:'canvas:open',width:760,height:700,scale:.2});assert.equal(state.scale,.08);
 state=resizeCanvasViewport(state,{key:'canvas:closed',width:760,height:700,scale:.2});assert.equal(state.scale,.2,'explicitly collapsing the inspector may use the released space');
 state=resizeCanvasViewport(state,{key:'canvas:closed',width:759,height:700,scale:.3});assert.equal(state.scale,.2);
 state=resizeCanvasViewport(state,{key:'canvas:closed',width:1280,height:820,scale:.4});assert.equal(state.scale,.4,'expanding the viewport refits normally');
});

test('a rotated or enlarged layer beyond one canvas edge can be reached without exposing the opposite margin',async()=>{
 const {canvasPanContent,constrainCamera}=await import('../src/stitch/canvas-viewport.js');
 const viewport={width:400,height:300},layer={x:-400,y:100,width:600,height:300};
 const content=canvasPanContent(viewport,layer,1);
 assert.deepEqual(constrainCamera({zoom:1,x:900,y:-800},viewport,content),{zoom:1,x:400,y:-100});
 assert.deepEqual(constrainCamera({zoom:1,x:-900,y:800},viewport,content),{zoom:1,x:0,y:0});
});

test('panning is bounded per axis and zoom retains the point at the centre of the view',async()=>{
 const {constrainCamera,zoomCanvasCamera,applyCanvasCamera}=await import('../src/stitch/canvas-viewport.js');
 const viewport={width:400,height:300},content={width:300,height:280};
 const moved=constrainCamera({zoom:2,x:180,y:-150},viewport,content);
 assert.deepEqual(moved,{zoom:2,x:100,y:-130});
 const zoomed=zoomCanvasCamera(moved,1.5);
 assert.deepEqual(zoomed,{zoom:3,x:150,y:-195});
 assert.deepEqual(applyCanvasCamera({scale:.25,offsetX:10,offsetY:18},zoomed),{scale:.75,offsetX:160,offsetY:-177});
 assert.deepEqual(constrainCamera({...moved,zoom:1},viewport,content),{zoom:1,x:0,y:0});
 assert.equal(zoomCanvasCamera(moved,100).zoom,8);
 assert.equal(zoomCanvasCamera(moved,.001).zoom,.1);
});

test('the image toolbar follows the visible image up to the outside of the top edge',()=>{
 const bounds={left:120,top:140,width:400,height:300};
 for(const mode of ['crop','split','rotate']){
  const place=(x,y)=>placeImageControls(bounds,{x,y,width:200,height:300},mode).tools;
  assert.deepEqual(place(180,250),{left:203,top:250-(mode==='rotate'?59:43)});
  const rise=mode==='rotate'?59:43;
  const dockedTop=bounds.top-4-39;
  for(const y of [140,139,-200,-1600])assert.equal(bounds.top-(place(180,y).top+39),4,'the docked menu leaves a small gap');
  for(const gap of [0.5,10,42])assert.equal(place(180,dockedTop+rise+gap).top,dockedTop+gap,'crossing the edge is continuous');
  assert.deepEqual(place(-50,530),{left:120,top:401});
  assert.deepEqual(place(490,130),{left:366,top:dockedTop});
 }
});

test('rotation controls clear all four outer corner handles without moving the image',()=>{
 const rect={x:100,y:200,width:80,height:40},before=structuredClone(rect),placement=placeImageControls({width:500,height:400},rect,'rotate');
 assert.equal(placement.tools.top+39,rect.y-20);assert.equal(placement.panel.top,rect.y+rect.height+18);assert.deepEqual(rect,before);
});

test('zoom buttons change fit-relative magnification by 25 percentage points, including after a gesture',async()=>{
 const {stepCanvasZoom}=await import('../src/stitch/canvas-viewport.js');
 assert.equal(stepCanvasZoom(1,1),1.25);
 assert.equal(stepCanvasZoom(1.25,-1),1);
 assert.equal(stepCanvasZoom(1.32,1),1.57);
 assert.equal(stepCanvasZoom(1.32,-1),1.07);
 assert.equal(stepCanvasZoom(7.9,1),8);
 assert.equal(stepCanvasZoom(.25,-1),.1);
 assert.equal(stepCanvasZoom(8,1),8);
 assert.equal(stepCanvasZoom(.1,-1),.1);
});

test('wheel zoom accumulates fractional input, normalizes wheel units and limits single-event jumps',async()=>{
 const {wheelZoomFactor}=await import('../src/stitch/canvas-viewport.js');
 const factor=(delta,mode=0)=>wheelZoomFactor(delta,mode,600);
 assert.ok(factor(-.5)>1&&factor(-.5)<1.01);
 assert.ok(Math.abs(factor(-.5)**24-factor(-12))<1e-12);
 // Chromium represents a pinch scale as a sequence of -100 * ln(scale) pixel deltas.
 const pinchDelta=-100*Math.log(1.5)/12;
 assert.ok(Math.abs(factor(pinchDelta)**12-1.5)<1e-12);
 assert.equal(factor(-3,1),factor(-48));
 assert.ok(Math.abs(factor(-120)*factor(120)-1)<1e-12);
 assert.ok(factor(-120)>1.45&&factor(-120)<2);
 assert.equal(factor(-1,2),1.6);
 assert.equal(factor(1,2),1/1.6);
 assert.equal(factor(0),1);
});
