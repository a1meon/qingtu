const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win,expression){for(let n=0;n<300;n++){if(await win.webContents.executeJavaScript(expression))return;await pause(100);}throw new Error('Timed out: '+expression);}
(async()=>{
 const root=process.env.QINGTU_RECOVERY_ROOT;if(!root)throw new Error('Missing isolated smoke root');
 const phase=process.env.QINGTU_RECOVERY_PHASE;
 console.log('Recovery phase: '+phase);
 const source=path.join(root,'input.png'),exports=path.join(root,'exports');await fs.mkdir(exports,{recursive:true});
 const {win,store}=await start({hidden:true,projectRoot:path.join(root,'projects'),testFolder:exports,testFiles:[source],onCloseTrace:message=>console.log(message),onCloseError:error=>{console.error(error);app.exit(1);}});
 win.on('closed',()=>console.log('Window closed'));
 app.on('will-quit',()=>console.log('App quitting'));
 win.webContents.setBackgroundThrottling(false);
 if(phase==='early-close'){win.close();return;}
 const js=expression=>win.webContents.executeJavaScript(expression);
 await waitFor(win,"!!document.querySelector('[aria-label=\"图像拼接\"]')");
 await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");
 if(phase==='write'){await waitFor(win,"!!document.querySelector('[aria-label=\"新建画布\"]')&&!document.querySelector('[aria-label=\"新建画布\"]').disabled");await js("document.querySelector('[aria-label=\"新建画布\"]').click()");}
 await waitFor(win,"!!document.querySelector('.project-name') && !document.querySelector('.project-name').disabled");
 if(phase==='write'){
  console.log('Importing source');
  await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1 && document.querySelector('.save-status').textContent==='已自动保存'");
  const save=store.save.bind(store);store.save=async value=>{await pause(200);return save(value);};
  console.log('Editing then closing');
  await js("(()=>{const input=document.querySelector('#stitch-width');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2400');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await js("(()=>{const input=document.querySelector('#stitch-height');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2000');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  // Normal close is requested immediately, while the new autosave is pending.
  await js("window.qingtu.windowAction('close')");
  console.log('Close requested');
 }else if(phase==='gesture'){
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1");
  await js("document.querySelectorAll('.layout-options button')[3].click()");
  await waitFor(win,"!!document.querySelector('.stitch-layer.movable') && document.querySelector('.save-status').textContent==='已自动保存'");
  const point=await js("(()=>{const r=document.querySelector('.stitch-layer').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:(Math.max(r.left,a.left)+Math.min(r.right,a.right))/2,y:(Math.max(r.top,a.top)+Math.min(r.bottom,a.bottom))/2};})()");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+50,y:point.y+20,button:'left',buttons:1});
  await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  // Quit before mouse release: application's Quit also waits for this gesture.
  app.quit();
 }else if(phase==='resize'){
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1 && document.querySelector('.save-status').textContent==='已自动保存'");
  const before=await store.load((await store.list())[0].id);
  const point=await js("(()=>{const r=document.querySelector('[data-handle=e]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+30,y:point.y,buttons:1});
  await waitFor(win,"document.querySelector('.stitch-canvas').dataset.interacting==='true'");
  const held=await js("(()=>{const p=document.querySelector('.stitch-layer.selected'),c=document.querySelector('.stitch-canvas'),scale=parseFloat(c.style.width)/Number(c.dataset.canvasWidth);return {width:parseFloat(p.style.width)/scale,height:parseFloat(p.style.height)/scale};})()");assert.ok(held.width>before.positions[before.images[0].id].width);await fs.writeFile(path.join(root,'held-resize.json'),JSON.stringify(held));app.quit();
 }else if(phase==='prefill'){
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1 && document.querySelector('.save-status').textContent==='已自动保存'");
  await js("document.querySelector('.stitch-layer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await waitFor(win,"document.querySelector('#crop-amount')?.value==='50'");
  app.quit();
 }else if(phase==='crop'){
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1 && document.querySelector('.save-status').textContent==='已自动保存'");
  await js("document.querySelector('.stitch-layer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await waitFor(win,"!!document.querySelector('.crop-edge-left')");
  const point=await js("(()=>{const r=document.querySelector('.crop-edge-left').getBoundingClientRect(),p=document.querySelector('.stitch-layer.selected').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dx:p.width*40/400};})()");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+point.dx,y:point.y,buttons:1});
  await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");assert.equal(await js("document.querySelector('#crop-amount').value"),'40');
  const prior=await store.load((await store.list())[0].id);assert.equal(prior.edits?.[prior.images[0].id],undefined);
  // Quit before the crop edge is released. The latest draft must flush.
  app.quit();
 }else{
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1");
  assert.equal(await js("document.querySelector('#stitch-width').value"),'2400');assert.equal(await js("document.querySelector('#stitch-height').value"),'2000');
  assert.equal(await js("document.querySelector('#stitch-format').textContent"),'PNG');
  const project=await store.load((await store.list())[0].id);assert.equal(project.images.length,1);assert.equal(project.export.longEdge,2400);
  assert.deepEqual(project.initialOrder,project.images.map(image=>image.id));
  assert.equal(project.layout,'free');assert.ok(project.positions[project.images[0].id].x>0);assert.ok(project.positions[project.images[0].id].y>0);
  const heldResize=JSON.parse(await fs.readFile(path.join(root,'held-resize.json'),'utf8')),pose=project.positions[project.images[0].id];assert.ok(Math.abs(pose.width-heldResize.width*.8)<.01,JSON.stringify({pose,heldResize}));assert.ok(Math.abs(pose.height-heldResize.height)<.01);assert.ok(Math.abs(pose.width/pose.height-320/300)<1e-9,'resize flush plus symmetric crop retains source aspect');
  assert.deepEqual(project.edits[project.images[0].id].edges,{left:40,top:0,right:40,bottom:0});
  await js("document.querySelector('.module-content:not([hidden]) .export-button').click()");
  await waitFor(win,"document.querySelector('.notice')?.textContent.includes('已导出 1 张图像')");
  const filename=(await fs.readdir(exports))[0],sharp=(await import('sharp')).default,meta=await sharp(path.join(exports,filename)).metadata(),bytes=(await fs.stat(path.join(exports,filename))).size;
  assert.deepEqual([meta.width,meta.height],[2400,2000]);assert.ok(bytes<=10000000);
  await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,closeBeforeReady:true,normalCloseFlush:true,closeDuringGesture:true,closeDuringResize:true,untouchedPrefillNotAppliedOnQuit:true,importOrderRestored:true,closeDuringCropEdge:true,reopenedAfterSourceMoved:true,restoredDimensions:[meta.width,meta.height],format:meta.format,bytes,originalCopy:true},null,2));
  await js("window.qingtu.windowAction('close')");
 }
})().catch(error=>{console.error(error);app.exit(1);});
