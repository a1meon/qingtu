const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-view-navigation-','viewport-navigation');
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible()&&!s.win.isFocused());
 await s.loadAutoCanvas(240);await s.importFiles([path.resolve('public/samples/alpine-lake.jpg')]);await s.edit('#stitch-width',600);await s.ready();await s.click('.stitch-layer');
 const rect=selector=>s.js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`),bounds=()=>rect('.stitch-canvas'),settled=()=>s.js('new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),200))');
 const same=(a,b)=>{for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<.1,`${k}: ${JSON.stringify({a,b})}`);},centre=(a,b)=>{assert.ok(Math.abs(a.x+a.width/2-b.x-b.width/2)<.1);assert.ok(Math.abs(a.y+a.height/2-b.y-b.height/2)<.1);};
 const anchor=async()=>{
  const menu=await rect('.inline-image-tools'),image=await rect('.stitch-layer'),area=await rect('.stitch-canvas-area');
  const name=await rect('.stitch-stage .project-name'),actions=await rect('.stitch-stage .preview-actions');
  const separateRow=await s.js("document.querySelector('.stitch-stage .file-toolbar').hasAttribute('data-tools-row')");
  const inHeader=!separateRow&&menu.top<Math.max(name.bottom,actions.bottom)+4;
  const left=inHeader?Math.max(area.left,name.right+4):area.left,right=inHeader?Math.min(area.right,actions.left-4):area.right;
  const x=Math.max(left,Math.min(image.left+(image.width-menu.width)/2,right-menu.width));
  const y=Math.max(area.top-menu.height-4,Math.min(image.top-43,area.bottom-menu.height));
  assert.ok(Math.abs(menu.left-x)<1&&Math.abs(menu.top-y)<1,JSON.stringify({menu,image,area}));
 };
 const initial=await bounds(),original=await s.load(),calls=s.calls();let saves=0;const save=s.store.save.bind(s.store);s.store.save=(...args)=>{saves++;return save(...args);};
 assert.equal(await s.js("document.querySelector('[aria-label=视图缩放比例]').textContent"),'100%');assert.equal(await s.js("!!document.querySelector('[aria-label=平移视图]')"),false);assert.equal(await s.js("document.querySelector('.canvas-navigation-slot [aria-label=图像尺寸]')"),null,'selecting an image adds no resolution next to zoom controls');
 const viewport=await rect('.stitch-canvas-area');centre(viewport,initial);
 await s.click('[aria-label="放大视图"]');await settled();const enlarged=await bounds();assert.ok(Math.abs(enlarged.width/initial.width-1.25)<.001);centre(viewport,enlarged);await anchor();
 await s.click('[aria-label="放大视图"]');await settled();assert.equal(await s.js("document.querySelector('[aria-label=视图缩放比例]').textContent"),'150%');
 await s.click('[aria-label="缩小视图"]');await settled();same(await bounds(),enlarged);
 s.win.webContents.debugger.attach('1.3');const cdp=(name,args)=>s.win.webContents.debugger.sendCommand(name,args);
 try{
  await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});const area=await rect('.stitch-canvas-area'),point={x:area.left+area.width*.3,y:area.top+area.height*.3};
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-120,modifiers:2});await settled();const after=await bounds();assert.ok(after.width/enlarged.width>=1.45&&after.width/enlarged.width<=2);centre(viewport,after);await anchor();
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:25,deltaY:40});await settled();
  const scrolled=await bounds();assert.ok(scrolled.x<after.x&&scrolled.y<after.y);await anchor();
  const drag=async(button,dx,dy)=>{
   const buttons=button==='middle'?4:1;
   await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
   await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button,buttons,clickCount:1});
   await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y+dy,buttons});
   await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button,buttons:0,clickCount:1});await settled();
  };
  await drag('middle',10,8);const middle=await bounds();assert.ok(middle.x>scrolled.x&&middle.y>scrolled.y);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await drag('left',10,8);const space=await bounds();assert.ok(space.x>middle.x&&space.y>middle.y);
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  // Replay Chromium's fractional Ctrl+wheel pinch input inside the offscreen renderer.
  await s.js(`(()=>{
   const canvasArea=document.querySelector('.stitch-canvas-area'),deltaY=-100*Math.log(1.5)/12;
   for(let frame=0;frame<12;frame++)canvasArea.dispatchEvent(new WheelEvent('wheel',{deltaY,ctrlKey:true,cancelable:true,bubbles:true}));
  })()`);await settled();
  const pinched=await bounds();assert.ok(Math.abs(pinched.width/after.width-1.5)<.02,'trackpad magnification follows finger spacing');await anchor();
  assert.equal(await s.js('window.visualViewport.scale'),1);
 }finally{s.win.webContents.debugger.detach();}
 await s.click('[aria-label="复位视图"]');await settled();same(await bounds(),initial);assert.equal(await s.js("document.querySelector('[aria-label=视图缩放比例]').textContent"),'100%');
 await s.click('.stitch-layer');
 for(let zoom=125;zoom<=800;zoom+=25){
  await s.click('[aria-label="放大视图"]');await settled();await anchor();
  if(zoom>=600){
   assert.ok((await rect('.stitch-layer')).top<viewport.top);
   const menu=await rect('.inline-image-tools');
   assert.ok(Math.abs(viewport.top-menu.bottom-4)<1,'docked toolbar leaves four pixels above the display');
   const actions=await rect('.stitch-stage .preview-actions');
   assert.ok(menu.top>=actions.bottom||menu.right<=actions.left-3,'toolbar clears the workspace actions');
  }
 }
 const reachable=await s.js(`Array.from(document.querySelectorAll('.inline-image-tools button'),button=>{
  const box=button.getBoundingClientRect();return button.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
 })`);assert.deepEqual(reachable,[true,true,true,true]);
 for(const [mode,input] of [['裁剪','#crop-amount'],['分割','#split-at'],['旋转','#rotation-degrees']]){
  await s.click(`[aria-label="${mode}"]`);await s.wait(`!!document.querySelector('${input}')`);await settled();
  const panel=await rect('.image-editor'),nav=await rect('.canvas-viewport-controls');
  assert.ok(Math.abs(panel.top-viewport.bottom-4)<1,'zoomed '+mode+' panel docks below the visible edge');
  assert.ok(panel.left>=viewport.left-1&&panel.right<=viewport.right+1&&panel.bottom<=await s.js('innerHeight'));
  assert.ok(panel.right<=nav.left||panel.left>=nav.right||panel.bottom<=nav.top||panel.top>=nav.bottom,'parameters leave zoom controls reachable');
  assert.ok(await s.js(`(()=>{const e=document.querySelector('${input}'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`),mode+' input receives pointer events');
  await s.click(`[aria-label="${mode}"]`);await s.wait("!document.querySelector('.image-editor')");
 }
 await s.click('[aria-label="复位视图"]');await s.click('[aria-label="缩小视图"]');await settled();await anchor();
 assert.ok((await rect('.inline-image-tools')).top>viewport.top+1,'menu returns above the image after zooming out');
 await s.click('[aria-label="复位视图"]');await settled();
 const nav=await rect('.canvas-viewport-controls'),area=await rect('.stitch-canvas-area');assert.ok(nav.top>=area.bottom);assert.equal(s.calls(),calls);assert.equal(saves,0);assert.deepEqual((await s.load()).positions,original.positions);assert.deepEqual((await s.load()).canvas,original.canvas);
 await s.click('[data-layout=free]');await s.ready();await s.click('.stitch-layer');await s.click('[aria-label="放大视图"]');await settled();const beforeMove=await s.load(),id=beforeMove.images[0].id,scale=(await bounds()).width/beforeMove.canvas.width;await s.drag('.stitch-layer',30*scale,0);const afterMove=await s.load();assert.ok(Math.abs(afterMove.positions[id].x-beforeMove.positions[id].x-30)<.1);await anchor();await s.capture('centred-zoom.png');
 await s.finish({passed:true,offscreen:true,default100:true,zoomAbove100:true,fixedCentreButtonAndModifierWheel:true,proportionalPinch:true,boundedWheelSpaceAndMiddlePan:true,reset100:true,noResolutionBesideZoom:true,toolbarFollowsImage:true,toolbarPinnedAndReachableAtHighZoom:true,controlsOutsideDisplay:true,noNavigationSaveOrEncode:true,zoomedImageEditingCoordinates:true});
})().catch(error=>{console.error(error);app.exit(1)});
