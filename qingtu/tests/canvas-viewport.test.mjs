import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasViewport,CONTROL_PANEL_HEIGHT,hasOffscreenImages} from '../src/stitch/canvas-viewport.js';

test('small-window viewing fills the available work area without reserving a closed editor',()=>{
 const bounds={width:545,height:226},layout={width:1200,height:480};
 const view=fitCanvasViewport(bounds,layout,{hasImages:true}),height=layout.height*view.scale,top=(bounds.height-height)/2+view.offsetY;
 assert.equal(height,158);assert.equal(top,52);assert.equal(bounds.height-top-height,16);
 assert.ok(height>5*(bounds.height-200));
});
test('open crop and split controls fit below the canvas with the toolbar above',()=>{
 for(const height of [226,360,556])for(const editor of ['crop','split']){
  const bounds={width:545,height},layout={width:1200,height:480},view=fitCanvasViewport(bounds,layout,{hasImages:true,editor});
  const canvasHeight=layout.height*view.scale,top=(height-canvasHeight)/2+view.offsetY;
  assert.ok(top>=52-1e-9);assert.ok(top+canvasHeight+10+CONTROL_PANEL_HEIGHT[editor]<=height-8+1e-9);
  assert.ok(layout.width*view.scale<=bounds.width-32+1e-9);
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
  assert.deepEqual(layout,before);
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
