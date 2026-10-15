import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasViewport,CONTROL_PANEL_HEIGHT} from '../src/stitch/canvas-viewport.js';

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
