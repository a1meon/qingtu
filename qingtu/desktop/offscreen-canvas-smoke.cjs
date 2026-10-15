const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-offscreen-canvas-','offscreen-canvas'),file=path.resolve('artifacts/stitch-fixtures/01-alpine.jpg');
 const paint=()=>s.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await s.edit('#stitch-height',240);await s.importFiles([file]);await s.edit('#stitch-width',600);await s.ready();await s.click('[data-layout=free]');await s.ready();
 const first=await s.load(),image=first.images[0],source=await s.store.readAsset(image.assetId),scale=await s.js("document.querySelector('.stitch-canvas').getBoundingClientRect().width/600");
 await s.drag('.stitch-layer',450*scale,0);await s.edit('#stitch-width',120);await s.edit('#stitch-height',120);await s.ready();
 const outside=await s.load(),beforeCalls=s.calls();
 let saves=0;const persist=s.store.save.bind(s.store);s.store.save=(...args)=>{saves++;return persist(...args);};
 assert.ok(await s.js("(()=>{const a=document.querySelector('.stitch-canvas-area').getBoundingClientRect(),g=document.querySelector('.stitch-ghost').getBoundingClientRect();return g.left>a.right;})()"),'shrinking the canvas reproduces an unreachable image');
 await s.capture('outside-before-reveal.png');await s.click('[aria-label="显示全部图片"]');await paint();
 async function assertVisible(){assert.ok(await s.js("(()=>{const a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return ['.stitch-canvas','.stitch-ghost'].every(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.left>=a.left&&r.top>=a.top&&r.right<=a.right+.05&&r.bottom<=a.bottom+.05;});})()"),'overview includes both the actual canvas and complete image');}
 await assertVisible();assert.equal(s.calls(),beforeCalls);assert.equal(saves,0);assert.deepEqual((await s.load()).positions,outside.positions);assert.deepEqual((await s.load()).canvas,outside.canvas);
 await s.capture('all-visible.png');await s.click('[aria-label="聚焦画布"]');await paint();assert.equal(s.calls(),beforeCalls);assert.deepEqual((await s.load()).positions,outside.positions);
 await s.win.webContents.reload();await s.wait("!!document.querySelector('[aria-label=\"图像拼接\"]')");await s.click('[aria-label="图像拼接"]');await s.ready();assert.deepEqual((await s.load()).positions,outside.positions);
 await s.click('[aria-label="显示全部图片"]');await paint();await assertVisible();
 const point=await s.js("(()=>{const r=document.querySelector('.stitch-ghost').getBoundingClientRect(),c=document.querySelector('.stitch-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:c.width/120};})()"),calls=s.calls(),beforeDragSaves=saves;
 const send=(type,x,buttons)=>s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y:point.y,button:buttons?'left':type==='mouseMoved'?'none':'left',buttons,clickCount:1});
 s.win.webContents.debugger.attach('1.3');
 try{
  await send('mousePressed',point.x,1);for(let n=1;n<=16;n++)await send('mouseMoved',point.x-450*point.scale*n/16,1);await paint();
  assert.equal(s.calls(),calls);assert.equal(saves,beforeDragSaves);assert.deepEqual((await s.load()).positions,outside.positions,'held recovery drag never saves');
  assert.ok(await s.js("(()=>{const a=document.querySelector('.stitch-ghost').getBoundingClientRect(),b=document.querySelector('.stitch-selection').getBoundingClientRect();return ['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<.05);})()"));
  await send('mouseReleased',point.x-450*point.scale,0);
 }finally{s.win.webContents.debugger.detach();}
 await s.ready();const recovered=await s.load(),pose=recovered.positions[image.id];assert.ok(Math.abs(pose.x)<1e-8);assert.ok(Math.abs(pose.y)<1e-8);assert.equal(pose.width,first.positions[image.id].width);assert.equal(pose.height,first.positions[image.id].height);assert.deepEqual(recovered.canvas,{width:120,height:120});
 assert.ok((await s.store.readAsset(image.assetId)).equals(source));await s.capture('dragged-back.png');const output=await s.save('recovered-free-image');
 await s.finish({passed:true,reproducedAfterCanvasResize:true,overviewRevealsOriginalPoses:true,viewOnlyNoSaveOrEncode:true,reloadCanReveal:true,actualGhostDragRecovers:true,selectionAligned:true,noSaveOrEncodeWhileHeld:true,canvasRemains120Square:true,originalSizeAndBytesRetained:true,before:outside.positions[image.id],after:pose,output});
})().catch(error=>{console.error(error);app.exit(1);});
