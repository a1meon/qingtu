const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-opt-settings-','optimization-settings');
 await s.edit('#stitch-height',240);await s.importFiles(['01-alpine.jpg','02-cabin.jpg','03-coast.jpg','04-alpine.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name)));
 const original=await s.load(),beforeCalls=s.calls();await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-settings')");
 assert.deepEqual(await s.js("[document.querySelector('[aria-label=\"优化顶部裁剪比例\"]').value,document.querySelector('[aria-label=\"优化左右裁剪像素\"]').value]"),['15','100']);
 async function chooseImage(label){
  await s.click('#optimization-image');await s.wait("!!document.querySelector('#optimization-image-list')");
  await s.js("Promise.all(document.querySelector('#optimization-image-list').getAnimations().map(animation=>animation.finished))");
  await s.js(`(()=>{const e=[...document.querySelectorAll('#optimization-image-list [role=option]')].find(e=>e.querySelector('span').textContent===${JSON.stringify(label)});e.scrollIntoView({block:'nearest'});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
  const point=await s.js(`(()=>{const e=[...document.querySelectorAll('#optimization-image-list [role=option]')].find(e=>e.querySelector('span').textContent===${JSON.stringify(label)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  s.win.webContents.debugger.attach('1.3');try{await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}finally{s.win.webContents.debugger.detach();}
  await s.wait("!!document.querySelector('.optimization-settings')&&!document.querySelector('#optimization-image-list')");assert.equal(await s.js("document.querySelector('#optimization-image').textContent"),label);await s.ready();
 }
 async function reopen(){const loaded=new Promise(resolve=>s.win.webContents.once('did-finish-load',resolve));s.win.webContents.reload();await loaded;await s.wait("!!document.querySelector('[aria-label=\"图像拼接\"]')");await s.click('[aria-label="图像拼接"]');await s.ready();}
 assert.equal(await s.js("document.querySelector('#optimization-image').textContent"),'第 3 张');
 await chooseImage('第 4 张');

 await s.edit('[aria-label="优化顶部裁剪比例"]',20);await s.edit('[aria-label="优化左右裁剪像素"]',150);await s.ready();
 const configured=await s.load();assert.deepEqual(configured.optimization,{topPercent:20,sidePixels:150,imageNumber:4});assert.deepEqual(configured.edits,original.edits);assert.deepEqual(configured.positions,original.positions);assert.equal(s.calls(),beforeCalls,'editing ready optimization settings never encodes unchanged pixels');
 await s.capture('configured.png');await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();
 const optimized=await s.load();assert.deepEqual(optimized.edits[optimized.images[3].id].edges,{left:150,right:150,top:768,bottom:0});assert.deepEqual(optimized.canvas,original.canvas);assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);
 await reopen();await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-settings')");
 assert.deepEqual(await s.js("[document.querySelector('[aria-label=\"优化顶部裁剪比例\"]').value,document.querySelector('[aria-label=\"优化左右裁剪像素\"]').value]"),['20','150']);
 const calls=s.calls();await s.edit('[aria-label="优化顶部裁剪比例"]',100);await s.wait("document.querySelector('.optimization-settings [role=alert]')?.textContent.includes('小于 100')");assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);assert.deepEqual((await s.load()).optimization,{topPercent:20,sidePixels:150,imageNumber:4});assert.equal(s.calls(),calls);
 await chooseImage('不选择');assert.deepEqual((await s.load()).optimization,{topPercent:20,sidePixels:150,imageNumber:null},'choosing no special crop recovers an invalid draft before disabling its fields');
 await chooseImage('第 4 张');await s.edit('[aria-label="优化顶部裁剪比例"]',15);await s.edit('[aria-label="优化左右裁剪像素"]',100);
 await chooseImage('不选择');assert.equal((await s.load()).optimization.imageNumber,null);assert.equal(await s.js("document.querySelector('[aria-label=\"优化顶部裁剪比例\"]').disabled"),true);
 await s.capture('no-selected-image.png');await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();
 const uniform=await s.load();assert.ok(uniform.images.every(image=>uniform.edits[image.id].edges===undefined));
 await reopen();await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-settings')");assert.equal(await s.js("document.querySelector('#optimization-image').textContent"),'不选择');
 await chooseImage('第 3 张');await s.capture('default-15-third-image.png');await s.ready();await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();
 const restored=await s.load();assert.deepEqual(restored.edits[restored.images[2].id].edges,{left:100,right:100,top:576,bottom:0});
 const transformations=[];
 for(const [name,factor,shift] of [['enlarge',.25,false],['shrink',-.2,false],['stretch',.2,true]]){
  const beforeTransform=await s.load();
  await s.js("document.querySelector('.stitch-layer').focus()");await s.wait("!!document.querySelector('[data-handle=e]')");
  const width=await s.js("document.querySelector('.stitch-layer').getBoundingClientRect().width");await s.drag('[data-handle=e]',width*factor,0,shift);
  const resized=await s.load();assert.notDeepEqual(resized.positions,beforeTransform.positions);assert.deepEqual(resized.edits,beforeTransform.edits);assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),false,'resize makes optimization available again');
  if(name==='enlarge'){
   await s.capture('resized-ready-to-optimize.png');await reopen();assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),false,'resized project stays optimizable after reopen');
  }
  await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();
  const next=await s.load();assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);assert.deepEqual(next.canvas,resized.canvas);assert.deepEqual(next.export,resized.export);assert.deepEqual(next.importSizes,restored.importSizes);
  let x=0;for(const image of next.images){const pose=next.positions[image.id];assert.ok(Math.abs(pose.x-x)<1e-8);assert.ok(Math.abs(pose.y)<1e-8);assert.ok(Math.abs(pose.height-next.canvas.height)<1e-8);x+=pose.width;}assert.ok(Math.abs(x-next.canvas.width)<1e-8);
  transformations.push({name,buttonReenabled:true,reoptimized:true,canvas:next.canvas});
 }
 await s.capture('reoptimized.png');
 for(let n=0;n<original.images.length;n++)assert.ok((await s.store.readAsset(original.images[n].assetId)).equals(await fs.readFile(path.resolve('artifacts/stitch-fixtures',original.images[n].name))));
 const output=await s.save('default-100-optimization');
 const last=await s.load();await s.store.save({...last,optimization:{...last.optimization,imageNumber:100}});
 await reopen();await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('#optimization-image')");assert.equal(await s.js("document.querySelector('#optimization-image').textContent"),'第 100 张');
 await s.click('#optimization-image');await s.wait("!!document.querySelector('#optimization-image-list')");assert.ok(await s.js("document.querySelector('#optimization-image-list').getBoundingClientRect().height<=280"));await s.js("document.querySelector('#optimization-image-list').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");assert.equal(await s.js("!!document.querySelector('#optimization-image-list')"),true,'scrolling a long image list keeps the selector open');
 await s.js("document.querySelector('#optimization-image-list').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");assert.equal(await s.js("!!document.querySelector('.optimization-settings')&&!document.querySelector('#optimization-image-list')"),true,'Escape closes the image list while keeping crop settings open');await chooseImage('第 3 张');
 await s.finish({passed:true,defaults:{topPercent:15,sidePixels:100,imageNumber:3},custom:{topPercent:20,sidePixels:150,imageNumber:4},settingsOnlyNoCropOrEncode:true,autosaveAndReopen:true,invalidNotSavedOrApplied:true,invalidDraftCanSelectNone:true,customCutsExact:true,defaultCutsExact:true,selectableImage:true,noSelectionUniformCrop:true,noSelectionSurvivesReopen:true,absentSelectionSurvivesReopen:true,longSelectorScrollable:true,resizeReopensOptimization:true,resizedProjectReopen:true,transformations,originalsUnchanged:true,output});
})().catch(error=>{console.error(error);app.exit(1);});
