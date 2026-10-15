const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-crop-canvas-','crop-canvas');
 await s.edit('#stitch-height',240);await s.importFiles(['01-alpine.jpg','02-cabin.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name)));
 await s.js("document.querySelectorAll('.stitch-layer')[1].focus()");await s.wait("document.querySelectorAll('.stitch-layer')[1].classList.contains('selected')");
 await s.click('.inline-image-tools button');await s.wait("document.querySelectorAll('.crop-corner-handle').length===4");
 const original=await s.load(),selectedId=await s.js("document.querySelector('.stitch-layer.selected').dataset.imageId"),image=original.images.find(image=>image.id===selectedId),asset=await s.store.readAsset(image.assetId),results=[];
 const paint=()=>s.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await s.js("window.cropTrace=[];for(const type of ['pointerdown','click'])document.addEventListener(type,event=>window.cropTrace.push({type,id:event.pointerId,detail:event.detail,target:event.target.className,editor:!!document.querySelector('.image-editor')}),true)");
 const send=(type,point,buttons)=>s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'?'none':'left',buttons,clickCount:1});
 async function drag(handle,fx,fy,{cancel=false,snap=false}={}){
  await paint();const before=await s.load(),calls=s.calls(),point=await s.js(`(()=>{const r=document.querySelector('[data-crop-handle=${handle}]').getBoundingClientRect(),p=document.querySelector('.stitch-layer.selected').getBoundingClientRect(),c=document.querySelector('.stitch-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dx:${snap}?c.right-p.right-2:p.width*${fx},dy:p.height*${fy},height:p.height};})()`);
  const end={x:point.x+point.dx,y:point.y+point.dy};s.win.webContents.debugger.attach('1.3');
  try{
   await send('mousePressed',{x:point.x,y:point.y},1);
   for(let n=1;n<=16;n++)await send('mouseMoved',{x:point.x+point.dx*n/16,y:point.y+point.dy*n/16},1);
   await paint();await s.wait("document.querySelector('.stitch-info').textContent.includes('编辑中')");
   const held=await s.js("(()=>{const c=document.querySelector('.stitch-canvas'),p=document.querySelector('.stitch-layer.selected').getBoundingClientRect(),r=document.querySelector('.canvas-crop-target').getBoundingClientRect();return {width:Number(c.dataset.canvasWidth),height:Number(c.dataset.canvasHeight),input:Number(document.querySelector('#stitch-width').value),image:[p.x,p.y,p.width,p.height],frame:[r.x,r.y,r.width,r.height],guides:Array.from(document.querySelectorAll('.crop-snap-guides .snap-guide'),g=>({axis:g.classList.contains('x')?'x':'y',position:parseFloat(g.style.left||g.style.top)}))};})()");
   assert.equal(held.height,240);assert.equal(held.width,held.input);assert.deepEqual(held.image,held.frame);assert.ok(Math.abs(held.image[3]-point.height)<.05,'crop retains display height');
   assert.equal(s.calls(),calls);assert.deepEqual((await s.load()).edits,before.edits,'drag does not autosave');
   if(before.canvasSizing==='manual')assert.equal(held.width,before.canvas.width);else assert.notEqual(held.width,before.canvas.width,'automatic width changes before release');
   if(snap)assert.ok(held.guides.some(g=>g.axis==='x'&&Math.abs(g.position-330*held.image[3]/240)<1),JSON.stringify({held,pose:before.positions[image.id],edits:before.edits,amount:await s.js("document.querySelector('#crop-amount').value")}));
   await s.capture(`held-${handle}${cancel?'-cancel':''}.png`);
   if(cancel){await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});}
   await send('mouseReleased',end,0);await paint();await s.ready();
   const after=await s.load();assert.ok(await s.js("!!document.querySelector('.image-editor')"),JSON.stringify(await s.js('window.cropTrace')));if(cancel){assert.deepEqual(after.edits,before.edits);assert.deepEqual(after.canvas,before.canvas);}else assert.equal(after.canvas.width,held.width);
   results.push({handle,cancel,snap,before:before.canvas,held:{width:held.width,height:held.height},after:after.canvas});return after;
  }finally{s.win.webContents.debugger.detach();}
 }
 for(const handle of ['nw','ne','se','sw']){
  await s.click('.crop-reset');await s.ready();const after=await drag(handle,handle.includes('w')?.25:-.25,handle.includes('n')?.25:-.25),edges=after.edits[image.id].edges;
  assert.ok(edges.left>0&&edges.left===edges.right);assert.ok(handle.includes('n')?edges.top>0&&edges.bottom===0:edges.bottom>0&&edges.top===0);
 }
 await s.click('.crop-reset');await s.ready();await drag('se',-.25,-.25,{cancel:true});
 await s.edit('#stitch-width',330);await s.ready();await s.click('[aria-label="关联左右裁剪"]');await s.ready();
 const snapped=await drag('right',-.22,0,{snap:true});assert.ok(Math.abs(snapped.positions[image.id].x+snapped.positions[image.id].width-330)<1);assert.equal(snapped.edits[image.id].edges.left,0);
 assert.ok((await s.store.readAsset(image.assetId)).equals(asset),'crop does not change original pixels');
 const output=await s.save('live-corner-snap');await fs.writeFile(path.join(s.artifact,'project.json'),JSON.stringify(snapped));
 await s.finish({passed:true,fourActualCorners:true,realtimeCanvasAndFields:true,retainsDisplayHeight:true,independentLinks:true,noEncodingOrSavingDuringDrag:true,escapeRestoresCanvas:true,manualCanvasFixed:true,canvasEdgeSnap:true,selectionAligned:true,immutableOriginal:true,results,output});
})().catch(error=>{console.error(error);app.exit(1);});
