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
    const boxes=await s.js(`Object.fromEntries(Object.entries({panel:'.image-editor',image:'.stitch-layer',area:'.stitch-canvas-area',nav:'.canvas-viewport-controls'}).map(([name,selector])=>[name,document.querySelector(selector).getBoundingClientRect().toJSON()]))`);
    const {panel,image,area,nav}=boxes,naturalTop=image.bottom+(mode==='旋转'?18:10);
    assert.ok(panel.left>=area.left-1&&panel.right<=area.right+1&&panel.top>=0&&panel.bottom<=height,JSON.stringify({width,mode,boxes}));
    assert.ok(panel.right<=nav.left||panel.left>=nav.right||panel.bottom<=nav.top||panel.top>=nav.bottom,'zoom controls remain accessible');
    const centredLeft=image.left+(image.width-panel.width)/2;
    if(centredLeft>=area.left&&centredLeft+panel.width<=nav.left-4){
     assert.ok(Math.abs(panel.left-centredLeft)<1&&Math.abs(panel.top-naturalTop)<1,'panel follows the image when space permits');
    }
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
 await s.finish({passed:true,offscreen:true,canvasAndImageUnchangedAcrossAllEditors:true,visibleParametersAndNavigation:true,dragAndRealInputHitTests:true,noEncodingOrProjectChanges:true,report});
})().catch(error=>{console.error(error);app.exit(1)});
