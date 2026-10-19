const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-empty-canvas-','empty-canvas'),cases=[];
 s.win.webContents.debugger.attach('1.3');
 try{
  await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  for(const [width,height] of [[800,650],[1024,650],[1280,820],[760,650]]){
   await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   // The narrow-width inspector overlays the work area; collapse it as a user
   // would so the central import action is reachable on that layout.
   if(width<=760)await s.click('[aria-label="收起导出设置"]');
   for(const [canvasWidth,canvasHeight] of [[5995,2398],[1200,1200],[240,600]]){
    await s.edit('#stitch-width',canvasWidth);await s.edit('#stitch-height',canvasHeight);
    await s.wait(`Number(document.querySelector('.stitch-canvas').dataset.canvasWidth)===${canvasWidth}&&Number(document.querySelector('.stitch-canvas').dataset.canvasHeight)===${canvasHeight}&&document.querySelector('.save-status').textContent==='已自动保存'`);
    await s.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const geometry=await s.js(`(()=>{const b=document.querySelector('[aria-label="添加画布图片"]'),c=document.querySelector('.stitch-canvas'),r=b.getBoundingClientRect(),a=c.getBoundingClientRect(),image=document.querySelector('.fixed-empty .empty-artwork'),i=image.getBoundingClientRect();return {button:r.toJSON(),canvas:a.toJSON(),image:i.toJSON(),imageShown:getComputedStyle(image).display!=='none',fontSize:parseFloat(getComputedStyle(b).fontSize),plusShown:getComputedStyle(b.querySelector('svg')).display!=='none',text:b.innerText,hit:[[r.x+r.width/2,r.y+r.height/2],[r.x+r.width*.15,r.bottom-r.height*.15],[r.right-r.width*.15,r.bottom-r.height*.15]].every(([x,y])=>!!document.elementFromPoint(x,y)?.closest('[aria-label="添加画布图片"]'))}})()`);
    cases.push({width,height,canvasWidth,canvasHeight,geometry});
    if(width===800&&canvasWidth===5995)await s.capture('small-window.png');
    const {button:b,canvas:c}=geometry;
    assert.ok(b.left>=c.left&&b.right<=c.right&&b.top>=c.top&&b.bottom<=c.bottom,JSON.stringify(cases.at(-1)));
    assert.ok(geometry.imageShown&&geometry.plusShown,'artwork and plus must remain visible even in a tiny canvas');assert.ok(b.width>0&&b.height>0);assert.ok(geometry.hit,'the middle and bottom of the button are not clipped');
    const i=geometry.image;assert.ok(i.top>=c.top&&i.bottom<b.top&&i.left>=c.left&&i.right<=c.right,'visible illustration fits without overlapping the button');assert.ok(Math.abs(i.width/b.width-160/200)<.001&&Math.abs(i.height/b.height-125/40)<.001,'the picture and button scale by the same factor');
    const previous=cases.slice(0,-1).find(item=>item.canvasWidth===canvasWidth&&item.canvasHeight===canvasHeight);if(previous)assert.ok(Math.abs(b.width/c.width-previous.geometry.button.width/previous.geometry.canvas.width)<.001,'the whole group scales with the same canvas across window sizes');
   }
  }
  await s.win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
 }finally{if(s.win.webContents.debugger.isAttached())s.win.webContents.debugger.detach();}
 await s.importFiles([path.resolve('public/samples/alpine-lake.jpg')]);assert.equal((await s.load()).images.length,1,'the adaptive import button still imports originals');
 await s.finish({passed:true,cases,buttonFullyVisible:true,illustrationAlwaysVisible:true,wholeGroupScales:true,actualImportWorks:true});
})().catch(error=>{console.error(error);app.exit(1);});
