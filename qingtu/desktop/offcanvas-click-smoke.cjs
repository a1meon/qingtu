const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-offcanvas-click-','offcanvas-click');
 await s.edit('#stitch-height',180);await s.importFiles([path.resolve('public/samples/alpine-lake.jpg'),path.resolve('public/samples/forest-cabin.jpg')]);await s.click('[aria-label=解锁画布宽高比例]');await s.edit('#stitch-width',260);await s.ready();await s.click('[data-layout=free]');await s.ready();const scale=await s.js("document.querySelector('.stitch-canvas').getBoundingClientRect().width/260");await s.drag('.stitch-layer.selected',280*scale,0);
 const before=await s.load(),point=await s.js("(()=>{const g=document.querySelector('.stitch-ghost').getBoundingClientRect(),c=document.querySelector('.stitch-canvas').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:(Math.max(g.left,c.right)+Math.min(g.right,a.right-10))/2,y:(Math.max(g.top,a.top)+Math.min(g.bottom,a.bottom))/2,ghost:g.toJSON(),canvas:c.toJSON(),area:a.toJSON()}})()");
 assert.ok(point.x>point.canvas.right&&point.x<point.area.right);
 const hit=await s.js(`document.elementFromPoint(${point.x},${point.y})?.outerHTML`);
 s.win.webContents.debugger.attach('1.3');try{for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});}finally{s.win.webContents.debugger.detach();}
 await s.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await s.js("document.querySelectorAll('.stitch-layer.selected').length"),1,'clicking the visible off-canvas picture must retain selection: '+JSON.stringify({point,hit}));
 assert.equal(await s.js("document.querySelectorAll('.stitch-ghost').length"),1);assert.deepEqual((await s.load()).positions,before.positions);await s.capture('clicked-outside.png');
 const menu=await s.js("(()=>{const t=document.querySelector('.inline-image-tools').getBoundingClientRect(),i=document.querySelector('.stitch-layer.selected').getBoundingClientRect();return {t:t.toJSON(),i:i.toJSON()}})()");
 assert.ok(menu.i.left+(menu.i.width+menu.t.width)/2>point.area.right,'the centred toolbar would cross the right edge');
 assert.ok(Math.abs(menu.t.right-point.area.right)<1,'the right edge of the toolbar aligns with the editor');
 assert.ok(Math.abs(menu.t.top-Math.max(point.area.top-menu.t.height-4,menu.i.top-43))<1);
 await s.drag('.stitch-ghost',-280*scale,0);assert.ok(await s.js("!!document.querySelector('.stitch-layer.selected')"));const restored=await s.load(),id=restored.images[0].id;assert.ok(Math.abs(restored.positions[id].x-before.positions[id].x+280)<.1);
 await s.drag('.stitch-layer.selected',-100*scale,-30*scale);const outside=await s.load(),leftPoint=await s.js("(()=>{const g=document.querySelector('.stitch-ghost').getBoundingClientRect(),c=document.querySelector('.stitch-canvas').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:(Math.max(g.left,a.left+10)+Math.min(g.right,c.left-10))/2,y:Math.max(g.top,a.top+10)+20}})()");
 s.win.webContents.debugger.attach('1.3');try{for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...leftPoint,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});}finally{s.win.webContents.debugger.detach();}
 await s.ready();assert.ok(await s.js("!!document.querySelector('.stitch-layer.selected')"),'outside-left click retains the picture');assert.deepEqual((await s.load()).positions,outside.positions);await s.drag('.stitch-ghost',100*scale,30*scale);
 await s.finish({passed:true,outsideImageClickRetainsSelection:true,toolbarFollowsOutsideImage:true,outsideDragBack:true,leftAndRightClicks:true});
})().catch(error=>{console.error(error);app.exit(1)});
