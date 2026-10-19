const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-floating-editor-','floating-editor');
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible()&&!s.win.isFocused());
 await s.edit('#stitch-height',480);await s.importFiles([path.resolve('public/samples/alpine-lake.jpg')]);await s.edit('#stitch-width',1200);await s.ready();
 const project=await s.load(),calls=s.calls(),report=[];

 const geometry=()=>s.js("(()=>{const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};return {canvas:rect(document.querySelector('.stitch-canvas')),image:rect(document.querySelector('.stitch-layer'))}})()");
 const settled=()=>s.js('new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),350))');
 function same(a,b){for(const key of ['canvas','image'])a[key].forEach((v,i)=>assert.ok(Math.abs(v-b[key][i])<.05,`${key} changes: ${JSON.stringify({a,b})}`));}
 s.win.webContents.debugger.attach('1.3');
 try{
  await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  for(const [width,height] of [[1280,820],[1024,650],[740,650],[400,650],[1280,820]]){
   await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settled();
   await s.click('.stitch-layer');const before=await geometry();
   for(const mode of ['裁剪','旋转','分割']){
    await s.click(`[aria-label="${mode}"]`);await s.wait("!!document.querySelector('.image-editor')");await settled();same(before,await geometry());
    const bounds=await s.js("(()=>{const p=document.querySelector('.image-editor').getBoundingClientRect(),a=document.querySelector('.stitch-layer').getBoundingClientRect();return {panel:p.toJSON(),image:a.toJSON()}})()");
    assert.ok(Math.abs(bounds.panel.top-bounds.image.bottom-(mode==='旋转'?18:10))<1&&Math.abs(bounds.panel.x+bounds.panel.width/2-bounds.image.x-bounds.image.width/2)<1,JSON.stringify({width,mode,bounds}));
    if(mode==='裁剪'){
     const old=await s.js("document.querySelector('.image-editor').getBoundingClientRect().toJSON()"),p=await s.js("(()=>{const r=document.querySelector('.image-panel-grip').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
     for(const event of [{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1},{type:'mouseMoved',x:p.x-24,y:p.y-24,buttons:1},{type:'mouseReleased',x:p.x-24,y:p.y-24,button:'left',buttons:0,clickCount:1}])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
     await settled();const moved=await s.js("document.querySelector('.image-editor').getBoundingClientRect().toJSON()");assert.ok(moved.x<old.x||moved.y<old.y,'the overlay can be moved away from crop handles');same(before,await geometry());
     const point=await s.js("(()=>{const e=document.querySelector('#crop-amount'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
     await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
     assert.equal(await s.js("document.activeElement?.id"),'crop-amount','floating crop input is truly clickable: '+JSON.stringify({width,point,hit:await s.js(`document.elementFromPoint(${point.x},${point.y})?.outerHTML`)}));
     await s.capture(`crop-${width}.png`);
    }
    await s.js("document.querySelector('.image-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await s.wait("!document.querySelector('.image-editor')");same(before,await geometry());
   }
   report.push({width,height,bounds:before});
  }
 }finally{s.win.webContents.debugger.detach();}
 assert.equal(s.calls(),calls,'opening or moving controls never encodes');const after=await s.load();assert.deepEqual(after.positions,project.positions);assert.deepEqual(after.edits,project.edits);assert.deepEqual(after.canvas,project.canvas);assert.deepEqual(after.export,project.export);
 await s.finish({passed:true,offscreen:true,canvasAndImageUnchangedAcrossAllEditors:true,floatingControlsBelowImageWithoutClamping:true,dragAndRealInputHitTests:true,noEncodingOrProjectChanges:true,report});
})().catch(error=>{console.error(error);app.exit(1)});
