import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasViewport,placeImageControls,hasOffscreenImages,resizeCanvasViewport} from '../src/stitch/canvas-viewport.js';

test('small-window viewing fills the available work area without reserving a closed editor',()=>{
 const bounds={width:545,height:226},layout={width:1200,height:480};
 const view=fitCanvasViewport(bounds,layout,{hasImages:true}),height=layout.height*view.scale,top=(bounds.height-height)/2+view.offsetY;
 assert.equal(height,158);assert.equal(top,52);assert.equal(bounds.height-top-height,16);
 assert.ok(height>5*(bounds.height-200));
});
test('opening any image editor preserves the canvas scale and position',()=>{
 for(const height of [226,360,556])for(const editor of ['crop','split','rotate']){
  const bounds={width:545,height},layout={width:1200,height:480};
  assert.deepEqual(fitCanvasViewport(bounds,layout,{hasImages:true,editor}),fitCanvasViewport(bounds,layout,{hasImages:true}));
 }
});
test('parameters stay below the image even outside the work area',()=>{
 for(const rect of [{x:300,y:120,width:200,height:200},{x:20,y:60,width:400,height:510},{x:-400,y:700,width:200,height:200}]){
  const {panel}=placeImageControls({width:240,height:226},rect,'crop');
  assert.equal(panel.left,rect.x+rect.width/2-150);assert.equal(panel.top,rect.y+rect.height+10);assert.equal(panel.width,300);
 }
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
   assert.ok(top+rect.y*view.scale>=52-1e-9);assert.ok(top+(rect.y+rect.height)*view.scale<=bounds.height-16+1e-9);
  }
  assert.equal(view.offsetX,0);assert.equal(view.offsetY,18);assert.deepEqual(layout,before);
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
 const tools=placeImageControls(bounds,{x:-400,y:700,width:200,height:200}).tools;assert.deepEqual(tools,{left:-377,top:657});
});

test('rotation controls clear all four outer corner handles without moving the image',()=>{
 const rect={x:100,y:200,width:80,height:40},before=structuredClone(rect),placement=placeImageControls({},rect,'rotate');
 assert.equal(placement.tools.top+39,rect.y-20);assert.equal(placement.panel.top,rect.y+rect.height+18);assert.deepEqual(rect,before);
});
