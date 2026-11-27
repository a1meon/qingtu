const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-crop-canvas-','crop-canvas');
 await s.loadAutoCanvas(240);await s.importFiles(['01-alpine.jpg','02-cabin.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name)));
 await s.click('[aria-label=解锁画布宽高比例]');
 await s.js("document.querySelectorAll('.stitch-layer')[1].click()");await s.wait("document.querySelectorAll('.stitch-layer')[1].classList.contains('selected')");
 await s.click('.inline-image-tools button');await s.wait("document.querySelectorAll('.crop-corner-handle').length===4");
 const original=await s.load(),selectedId=await s.js("document.querySelector('.stitch-layer.selected').dataset.imageId"),image=original.images.find(image=>image.id===selectedId),asset=await s.store.readAsset(image.assetId),results=[];
 const paint=()=>s.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await s.js("window.cropTrace=[];for(const type of ['pointerdown','click'])document.addEventListener(type,event=>window.cropTrace.push({type,id:event.pointerId,detail:event.detail,target:event.target.className,editor:!!document.querySelector('.image-editor')}),true)");
 const send=(type,point,buttons)=>s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:buttons?'left':type==='mouseMoved'?'none':'left',buttons,clickCount:1});
 async function drag(handle,fx,fy,{cancel=false,nearBoundary=false}={}){
  await paint();const before=await s.load(),calls=s.calls(),point=await s.js(`(()=>{const r=document.querySelector('[data-crop-handle=${handle}]').getBoundingClientRect(),p=document.querySelector('.stitch-layer.selected').getBoundingClientRect(),c=document.querySelector('.stitch-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dx:${nearBoundary}?c.right-p.right-2:p.width*${fx},dy:p.height*${fy},height:p.height,width:p.width,top:p.top};})()`);
  const end={x:point.x+point.dx,y:point.y+point.dy};s.win.webContents.debugger.attach('1.3');
  try{
   await send('mousePressed',{x:point.x,y:point.y},1);
   for(let n=1;n<=16;n++)await send('mouseMoved',{x:point.x+point.dx*n/16,y:point.y+point.dy*n/16},1);
   await paint();await s.wait("document.querySelector('.stitch-info').textContent.includes('编辑中')");
   const held=await s.js("(()=>{const c=document.querySelector('.stitch-canvas'),p=document.querySelector('.stitch-layer.selected').getBoundingClientRect(),r=document.querySelector('.canvas-crop-target').getBoundingClientRect();return {width:Number(c.dataset.canvasWidth),height:Number(c.dataset.canvasHeight),input:Number(document.querySelector('#stitch-width').value),image:[p.x,p.y,p.width,p.height],frame:[r.x,r.y,r.width,r.height]};})()");
   assert.equal(held.height,240);assert.equal(held.width,held.input);assert.deepEqual(held.image,held.frame);const sourceHeight=image.height-(before.edits[image.id]?.edges?.top||0)-(before.edits[image.id]?.edges?.bottom||0);
   const tolerance=1+point.height/sourceHeight;
   assert.ok(Math.abs(held.image[3]-(point.height-Math.abs(point.dy)))<=tolerance,'cropping keeps the scale of surviving pixels');
   if(handle==='top'){
    assert.equal(held.image[2],point.width);
    assert.ok(Math.abs(held.image[1]+held.image[3]-point.top-point.height)<.05,'bottom edge stays in place');
   }
   assert.equal(s.calls(),calls);assert.deepEqual((await s.load()).edits,before.edits,'drag does not autosave');
   if(before.canvasSizing==='manual')assert.equal(held.width,before.canvas.width);else if(point.dx)assert.notEqual(held.width,before.canvas.width,'automatic width changes before release');
   await s.capture(`held-${handle}${cancel?'-cancel':''}.png`);
   if(cancel){await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});}
   await send('mouseReleased',end,0);await paint();await s.ready();
   const after=await s.load();assert.ok(await s.js("!!document.querySelector('.image-editor')"),JSON.stringify(await s.js('window.cropTrace')));if(cancel){assert.deepEqual(after.edits,before.edits);assert.deepEqual(after.canvas,before.canvas);}else assert.equal(after.canvas.width,held.width);
   results.push({handle,cancel,nearBoundary,before:before.canvas,held:{width:held.width,height:held.height},after:after.canvas});return after;
  }finally{s.win.webContents.debugger.detach();}
 }
 await s.click('.crop-reset');await s.ready();
 const height=await s.js("document.querySelector('.stitch-layer.selected').getBoundingClientRect().height");
 const tiny=await drag('top',0,1/height);
 assert.ok(Math.abs(tiny.edits[image.id].edges.top-image.height/height)<=1,'first display pixel moves the crop immediately');
 for(const handle of ['nw','ne','se','sw']){
  await s.click('.crop-reset');await s.ready();const after=await drag(handle,handle.includes('w')?.25:-.25,handle.includes('n')?.25:-.25),edges=after.edits[image.id].edges;
  assert.ok(edges.left>0&&edges.left===edges.right);assert.ok(handle.includes('n')?edges.top>0&&edges.bottom===0:edges.bottom>0&&edges.top===0);
 }
 await s.click('.crop-reset');await s.ready();await drag('se',-.25,-.25,{cancel:true});
 await s.click('.crop-reset');await s.ready();await paint();
 const sliderStart=await s.load(),sliderCalls=s.calls(),sliderBox=await s.js("(()=>{const r=document.querySelector('.crop-amount-slider').getBoundingClientRect();return {left:r.left+8,right:r.right-8,y:r.y+r.height/2};})()");
 s.win.webContents.debugger.attach('1.3');
 try{
  await send('mouseMoved',{x:sliderBox.left,y:sliderBox.y},0);await send('mousePressed',{x:sliderBox.left,y:sliderBox.y},1);await paint();for(let n=1;n<=16;n++)await send('mouseMoved',{x:sliderBox.left+(sliderBox.right-sliderBox.left)*n/16,y:sliderBox.y},1);await paint();
  assert.ok(Number(await s.js("document.querySelector('#crop-amount').value"))>image.width*.4,JSON.stringify({imageWidth:image.width,sliderBox,dom:await s.js("(()=>{const e=document.querySelector('.crop-amount-slider'),r=e.getBoundingClientRect();return {value:e.value,max:e.max,amount:document.querySelector('#crop-amount').value,rect:[r.x,r.y,r.width,r.height],hit:document.elementFromPoint(r.left+8,r.y+r.height/2)?.outerHTML,trace:window.cropTrace.slice(-4)};})()")}));
  assert.equal(s.calls(),sliderCalls);assert.deepEqual((await s.load()).edits,sliderStart.edits,'held slider does not save');
  await s.capture('slider-large-crop.png');
  await send('mouseMoved',{x:sliderBox.left,y:sliderBox.y},1);await paint();assert.equal(Number(await s.js("document.querySelector('#crop-amount').value")),0,'dragging back restores full source content');
  await send('mouseReleased',{x:sliderBox.left,y:sliderBox.y},0);
 }finally{s.win.webContents.debugger.detach();}
 await s.ready();const sliderRestored=await s.load();assert.deepEqual(sliderRestored.canvas,sliderStart.canvas);assert.deepEqual(sliderRestored.edits[image.id].edges,{left:0,right:0,top:0,bottom:0});
 await s.edit('#stitch-width',330);await s.ready();await s.click('[aria-label="关联左右裁剪"]');await s.ready();
 const final=await drag('right',-.22,0,{nearBoundary:true});
 const right=final.positions[image.id].x+final.positions[image.id].width;
 assert.ok(right<330,'pointer just inside canvas edge is not attracted to the boundary');assert.equal(final.edits[image.id].edges.left,0);
 assert.ok((await s.store.readAsset(image.assetId)).equals(asset),'crop does not change original pixels');
 const output=await s.save('live-corner-crop');await fs.writeFile(path.join(s.artifact,'project.json'),JSON.stringify(final));
 await s.finish({passed:true,cropSliderRestoresFullContent:true,sliderNoSaveOrEncodeWhileHeld:true,fourActualCorners:true,realtimeCanvasAndFields:true,retainsPixelScale:true,independentLinks:true,noEncodingOrSavingDuringDrag:true,escapeRestoresCanvas:true,manualCanvasFixed:true,preciseNearEdges:true,selectionAligned:true,immutableOriginal:true,results,output});
})().catch(error=>{console.error(error);app.exit(1);});
