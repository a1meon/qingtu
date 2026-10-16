const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-canvas-selection-','canvas-selection');
 await s.edit('#stitch-height',180);await s.importFiles([path.resolve('public/samples/alpine-lake.jpg'),path.resolve('public/samples/forest-cabin.jpg')]);await s.edit('#stitch-width',450);await s.ready();await s.click('[data-layout=free]');await s.ready();
 const selection=()=>s.js("document.querySelectorAll('.stitch-layer.selected').length"),visibleGhosts=()=>s.js("[...document.querySelectorAll('.stitch-ghost')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&Number(getComputedStyle(e).opacity)>0).map(e=>e.dataset.ghostImageId)");
 async function clickPoint(point){s.win.webContents.debugger.attach('1.3');try{for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});}finally{s.win.webContents.debugger.detach()}await s.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
 // Resize through the real handle, then shrink the canvas so pixels extend past it.
 await s.drag('.stitch-selection .handle-e',45,0);await s.edit('#stitch-width',260);await s.edit('#stitch-height',180);await s.ready();
 const before=await s.load(),calls=s.calls();let saves=0;const save=s.store.save.bind(s.store);s.store.save=(...args)=>{saves++;return save(...args)};
 assert.equal(await selection(),1);assert.equal((await visibleGhosts()).length,1,'only the selected image has an overflow layer');
 await s.capture('selected-overflow.png');
 await clickPoint(await s.js("(()=>{const r=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:r.left+3,y:r.top+3}})()"));
 assert.equal(await selection(),0,'clicking workspace blank space clears the selected image');assert.deepEqual(await visibleGhosts(),[],'deselection hides all pixels outside the canvas');assert.equal(await s.js("document.querySelector('.inline-image-controls')"),null);
 await s.capture('deselected-clipped.png');
 await s.click('.stitch-layer');assert.equal(await selection(),1);assert.equal((await visibleGhosts()).length,1);
 // Toolbar actions and the inline crop form must not be treated as blank space.
 await s.click('.inline-image-tools button');await s.wait("!!document.querySelector('.inline-image-editor')");
 await clickPoint(await s.js("(()=>{const r=document.querySelector('[aria-label=\"裁剪像素\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()"));assert.equal(await selection(),1);assert.equal(await s.js("!!document.querySelector('.inline-image-editor')"),true);
 await clickPoint(await s.js("(()=>{const r=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:r.left+3,y:r.top+3}})()"));assert.equal(await selection(),0);assert.deepEqual(await visibleGhosts(),[]);
 assert.deepEqual((await s.load()).positions,before.positions);assert.equal(saves,0,'selection changes do not edit or save the project');assert.equal(s.calls(),calls,'selection changes never encode images');
 await s.finish({passed:true,blankClickDeselects:true,onlySelectedOverflowVisible:true,cropFormRemainsUsable:true,noSelectionSaveOrEncode:true,originalGeometryPreserved:true});
})().catch(e=>{console.error(e);app.exit(1)});
