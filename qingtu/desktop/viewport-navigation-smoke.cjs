const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-view-navigation-','viewport-navigation');
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible()&&!s.win.isFocused());
 await s.edit('#stitch-height',240);await s.importFiles([path.resolve('public/samples/alpine-lake.jpg')]);await s.edit('#stitch-width',600);await s.ready();await s.click('.stitch-layer');
 const rect=selector=>s.js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`),bounds=()=>rect('.stitch-canvas'),settled=()=>s.js('new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),200))');
 const same=(a,b)=>{for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<.1,`${k}: ${JSON.stringify({a,b})}`);},centre=(a,b)=>{assert.ok(Math.abs(a.x+a.width/2-b.x-b.width/2)<.1);assert.ok(Math.abs(a.y+a.height/2-b.y-b.height/2)<.1);};
 const anchor=async()=>{const p=await rect('.inline-image-tools'),i=await rect('.stitch-layer');assert.ok(Math.abs(p.x+p.width/2-i.x-i.width/2)<1,JSON.stringify({p,i}));assert.ok(Math.abs(p.top-i.top+43)<1,JSON.stringify({p,i}));};
 const initial=await bounds(),original=await s.load(),calls=s.calls();let saves=0;const save=s.store.save.bind(s.store);s.store.save=(...args)=>{saves++;return save(...args);};
 assert.equal(await s.js("document.querySelector('[aria-label=视图缩放比例]').textContent"),'100%');assert.equal(await s.js("document.querySelector('[aria-label=平移视图]')"),null);assert.equal(await s.js("document.querySelector('.canvas-navigation-slot [aria-label=图像尺寸]')"),null,'selecting an image adds no resolution next to zoom controls');
 await s.click('[aria-label="放大视图"]');await settled();const enlarged=await bounds();assert.ok(Math.abs(enlarged.width/initial.width-1.25)<.001);centre(initial,enlarged);await anchor();
 s.win.webContents.debugger.attach('1.3');const cdp=(name,args)=>s.win.webContents.debugger.sendCommand(name,args);
 try{
  await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});const area=await rect('.stitch-canvas-area'),point={x:area.left+area.width*.3,y:area.top+area.height*.3};
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-120,modifiers:2});await settled();const after=await bounds();assert.ok(after.width>enlarged.width);centre(initial,after);await anchor();
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:25,deltaY:40});await settled();same(await bounds(),after);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});const blank={x:area.right-12,y:area.top+20};
  for(const button of ['middle','left']){await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...blank,button,buttons:button==='middle'?4:1,clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:blank.x+40,y:blank.y+25,buttons:button==='middle'?4:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:blank.x+40,y:blank.y+25,button,buttons:0,clickCount:1});await settled();same(await bounds(),after);}
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 }finally{s.win.webContents.debugger.detach();}
 await s.click('[aria-label="复位视图"]');await settled();same(await bounds(),initial);assert.equal(await s.js("document.querySelector('[aria-label=视图缩放比例]').textContent"),'100%');
 const nav=await rect('.canvas-viewport-controls'),area=await rect('.stitch-canvas-area');assert.ok(nav.top>=area.bottom);assert.equal(s.calls(),calls);assert.equal(saves,0);assert.deepEqual((await s.load()).positions,original.positions);assert.deepEqual((await s.load()).canvas,original.canvas);
 await s.click('.stitch-layer');await s.click('[aria-label="放大视图"]');await settled();const beforeMove=await s.load(),id=beforeMove.images[0].id,scale=(await bounds()).width/beforeMove.canvas.width;await s.drag('.stitch-layer',30*scale,0);const afterMove=await s.load();assert.ok(Math.abs(afterMove.positions[id].x-beforeMove.positions[id].x-30)<.1);await anchor();await s.capture('centred-zoom.png');
 await s.finish({passed:true,offscreen:true,default100:true,zoomAbove100:true,fixedCentreButtonAndModifierWheel:true,noWheelSpaceOrMiddlePan:true,reset100:true,noResolutionBesideZoom:true,toolbarFollowsImage:true,controlsOutsideDisplay:true,noNavigationSaveOrEncode:true,zoomedImageEditingCoordinates:true});
})().catch(error=>{console.error(error);app.exit(1)});
