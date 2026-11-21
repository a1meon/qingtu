import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasViewport,placeImageControls,placeImagePanel,hasOffscreenImages,resizeCanvasViewport} from '../src/stitch/canvas-viewport.js';

test('small-window viewing fills the available work area without reserving a closed editor',()=>{
 const bounds={width:545,height:226},layout={width:1200,height:480};
 const view=fitCanvasViewport(bounds,layout,{hasImages:true}),height=layout.height*view.scale,top=(bounds.height-height)/2+view.offsetY;
 assert.equal(height,138);assert.equal(top,44);assert.equal(bounds.height-top-height,44);
 assert.ok(placeImageControls(bounds,{x:0,y:top,width:layout.width*view.scale,height}).tools.top>=0);
 assert.ok(height>5*(bounds.height-200));
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
  assert.ok(view.scale>0);assert.ok(layout.width*view.scale<=bounds.width-32+1e-9);assert.ok(layout.height*view.scale<=bounds.height-32+1e-9);
 }
});

test('fitting all reveals off-canvas images on every side without changing canvas or poses',()=>{
 for(const bounds of [{width:545,height:226},{width:900,height:556}]){
  const layout={width:240,height:240,rects:[{id:'right',x:900,y:0,width:360,height:480},{id:'left',x:-600,y:-200,width:180,height:240},{id:'below',x:0,y:900,width:200,height:200}]},before=structuredClone(layout);
  const view=fitCanvasViewport(bounds,layout,{hasImages:true,includeImages:true}),left=(bounds.width-layout.width*view.scale)/2+view.offsetX,top=(bounds.height-layout.height*view.scale)/2+view.offsetY;
  for(const rect of [{x:0,y:0,width:layout.width,height:layout.height},...layout.rects]){
   assert.ok(left+rect.x*view.scale>=16-1e-9);assert.ok(left+(rect.x+rect.width)*view.scale<=bounds.width-16+1e-9);
   assert.ok(top+rect.y*view.scale>=44-1e-9);assert.ok(top+(rect.y+rect.height)*view.scale<=bounds.height-44+1e-9);
  }
  assert.equal(view.offsetX,0);assert.equal(view.offsetY,0);assert.deepEqual(layout,before);
  const normal=fitCanvasViewport(bounds,layout,{hasImages:true});assert.equal(normal.offsetX,0);assert.ok(normal.scale>view.scale,'ordinary viewing keeps its larger canvas');
 }
});

test('offscreen recovery is offered only when content cannot be reached, including after a smaller canvas',()=>{
 const bounds={width:900,height:556},rects=[{x:900,y:0,width:360,height:480}],wide={width:1200,height:480,rects},small={width:240,height:240,rects};
 assert.equal(hasOffscreenImages(bounds,wide,fitCanvasViewport(bounds,wide,{hasImages:true})),false);
 assert.equal(hasOffscreenImages(bounds,small,fitCanvasViewport(bounds,small,{hasImages:true})),true);
 assert.equal(hasOffscreenImages(bounds,small,fitCanvasViewport(bounds,small,{hasImages:true,includeImages:true})),false);
 for(const rect of [{x:-2000,y:0,width:200,height:100},{x:0,y:-2000,width:200,height:100},{x:0,y:2000,width:200,height:100}]){
  const layout={...small,rects:[rect]};assert.equal(hasOffscreenImages(bounds,layout,fitCanvasViewport(bounds,layout,{hasImages:true})),true);
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

test('view zoom stays at the fitted centre regardless of pointer or stale pan',async()=>{
 const {zoomCanvasCamera,applyCanvasCamera}=await import('../src/stitch/canvas-viewport.js');
 const camera={zoom:1,x:120,y:-70},before=structuredClone(camera),bounds={width:400,height:300};
 const zoomed=zoomCanvasCamera(camera,2,{x:150,y:100},bounds);
 assert.deepEqual(zoomed,{zoom:2,x:0,y:0});assert.deepEqual(camera,before);
 assert.deepEqual(applyCanvasCamera({scale:.25,offsetX:10,offsetY:18},zoomed),{scale:.5,offsetX:10,offsetY:18});
 assert.equal(zoomCanvasCamera(camera,100,{x:200,y:150},bounds).zoom,8);
 assert.equal(zoomCanvasCamera(camera,.001,{x:200,y:150},bounds).zoom,.1);
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
