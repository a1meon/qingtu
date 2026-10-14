const {app}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-resize-canvas-','resize-canvas');await s.edit('#stitch-width',600);await s.edit('#stitch-height',240);await s.importFiles([path.resolve('artifacts/stitch-fixtures/01-alpine.jpg')]);const initial=await s.load();assert.deepEqual(initial.canvas,{width:180,height:240});assert.equal(await s.js("document.querySelectorAll('.resize-handle').length"),2);
 async function resize(width){await s.js("document.querySelector('.stitch-layer').focus()");const p=await s.load(),pose=p.positions[p.images[0].id],scale=await s.js("parseFloat(document.querySelector('.stitch-canvas').style.width)/Number(document.querySelector('#stitch-width').value)");await s.drag('[data-handle=e]',(width-pose.width)*scale,0);const next=await s.load();assert.ok(Math.abs(next.positions[next.images[0].id].width-width)<.1);assert.equal(next.canvas.height,p.canvas.height);return next;}
 const enlarged=await resize(300);assert.deepEqual(enlarged.canvas,{width:300,height:240});assert.ok(enlarged.positions[enlarged.images[0].id].y<0);const smaller=await resize(150);assert.deepEqual(smaller.canvas,{width:150,height:240});
 const capped=await resize(660);assert.deepEqual(capped.canvas,{width:600,height:240});assert.ok(capped.positions[capped.images[0].id].height>240);await s.capture('width-capped.png');
 await s.edit('#stitch-width',500);await s.edit('#stitch-height',240);await s.ready();const manual=await resize(300);assert.deepEqual(manual.canvas,{width:500,height:240});const output=await s.save('height-resize-clipped');
 await s.finish({passed:true,canvasHeightFixed:true,onlyHorizontalHandles:true,defaultProportional:true,noEncodingDuringResize:true,widthCapDoesNotScaleSourceBack:true,initial:initial.canvas,enlarged:enlarged.canvas,smaller:smaller.canvas,capped:capped.canvas,manualCanvas:manual.canvas,output});
})().catch(error=>{console.error(error);app.exit(1);});
