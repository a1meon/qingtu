const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('node:fs/promises');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-image-actions-','image-actions');
 const files=[path.resolve('public/samples/alpine-lake.jpg'),path.resolve('public/samples/forest-cabin.jpg')];
 await s.edit('#stitch-height',100);await s.importFiles(files);await s.edit('#stitch-width',250);await s.ready();
 const count=()=>s.js("document.querySelectorAll('.stitch-layer').length");
 s.win.webContents.debugger.attach('1.3');
 try{
  await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  async function key(key,code){for(const type of ['rawKeyDown','keyUp'])await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code});await s.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
  await s.click('.stitch-layer');await s.js('document.activeElement.blur()');await key('Delete',46);
  await s.wait("document.querySelectorAll('.stitch-layer').length===1");await s.ready();assert.equal((await s.load()).images.length,1,'Delete acts on selection even when the image does not own DOM focus');
  await s.importFiles(files);await s.click('.stitch-layer');await s.js("document.querySelector('.inline-image-tools button').focus()");await key('Backspace',8);
  await s.wait("document.querySelectorAll('.stitch-layer').length===2");await s.ready();
  await s.click('.stitch-layer');await s.edit('.project-name','删除保护测试');await s.js("document.querySelector('.project-name').focus()");await key('Backspace',8);assert.equal(await count(),2,'typing in names never deletes a photo');await s.ready();
  await s.click('.stitch-layer');await s.click('.inline-image-tools [aria-label="裁剪"]');await s.wait("!!document.querySelector('[aria-label=\"裁剪像素\"]')");await s.js("document.querySelector('[aria-label=\"裁剪像素\"]').focus()");await key('Backspace',8);assert.equal(await count(),2,'editing crop values never deletes a photo');
  await s.click('.inline-image-tools [aria-label="裁剪"]');await s.ready();
  const tools=await s.js("[...document.querySelectorAll('.inline-image-tools button')].map(b=>({label:b.getAttribute('aria-label'),text:b.textContent}))");assert.deepEqual(tools,[{label:'裁剪',text:''},{label:'分割',text:''},{label:'旋转',text:''},{label:'删除图片',text:''}]);
  await s.capture('icon-tools.png');await s.click('.inline-image-tools [aria-label="删除图片"]');await s.wait("document.querySelectorAll('.stitch-layer').length===1");await s.ready();
  await s.click('.stitch-layer');await s.click('[aria-label="重置裁剪、缩放与顺序"]');await s.wait("!!document.querySelector('.stitch-dialog')");await key('Delete',46);assert.equal(await count(),1,'a confirmation dialog blocks background deletion');await s.click('.dialog-cancel');
  await s.js("document.querySelector('.project-name').focus()");
  const photo=await s.js("(()=>{const r=document.querySelector('.stitch-layer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...photo,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  await key('Delete',46);await s.wait("document.querySelectorAll('.stitch-layer').length===0");assert.equal((await s.load()).images.length,0,'a focused layer deletes exactly one image');
  await s.importFiles(files);await s.click('[aria-label="压缩调整"]');await key('Delete',46);assert.equal(await count(),2,'inactive stitching cannot receive delete shortcuts');await s.click('[aria-label="图像编辑"]');await s.ready();
  await s.js("document.querySelector('.stitch-canvas-area').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))");await s.js('document.activeElement.blur()');await key('Backspace',8);assert.equal(await count(),2,'blank deselection leaves nothing to delete');
  const square=path.join(s.root,'square.png');await fs.writeFile(square,await require('sharp')({create:{width:200,height:200,channels:4,background:'#e6a13b'}}).png().toBuffer());
  await s.click('[aria-label="新建画布"]');await s.wait("!!document.querySelector('[aria-label=\"添加画布图片\"]')");await s.edit('#stitch-height',100);await s.importFiles([square]);await s.edit('#stitch-width',250);await s.ready();
  assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),false);await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();
  const optimized=await s.load(),id=optimized.images[0].id;assert.deepEqual(optimized.canvas,{width:250,height:100});assert.equal(optimized.edits[id].axis,'vertical');assert.ok(Math.abs(optimized.edits[id].fraction-.3)<1e-12);assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);
  const exported=await s.save('自适应优化');assert.deepEqual([exported.width,exported.height],[250,100]);await s.capture('adaptive-optimization.png');
  await s.finish({passed:true,deleteWithoutImageFocus:true,backspaceFromToolbar:true,inputFieldsProtected:true,iconOnlyToolbar:true,deleteButton:true,noDoubleDeletion:true,photoClickClearsOldInputFocus:true,dialogProtected:true,inactiveModuleProtected:true,deselectedProtected:true,narrowOriginalOptimizes:true,optimizedExport:exported});
 }finally{if(!s.win.isDestroyed()&&s.win.webContents.debugger.isAttached())s.win.webContents.debugger.detach();}
})().catch(e=>{console.error(e);app.exit(1)});
