const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-opt-settings-','optimization-settings');
 const openSettings=async()=>{await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-settings')");};
 const toggle=async n=>{await s.click(`[aria-label="第 ${n} 张特殊裁剪"]`);await s.ready();};
 const top=n=>`[aria-label="第 ${n} 张优化顶部裁剪比例"]`,sides=n=>`[aria-label="第 ${n} 张优化左右裁剪像素"]`;
 async function reopen(){const loaded=new Promise(resolve=>s.win.webContents.once('did-finish-load',resolve));s.win.webContents.reload();await loaded;await s.wait("!!document.querySelector('[aria-label=\"图像编辑\"]')");await s.click('[aria-label="图像编辑"]');await s.ready();}
 async function optimize(){await s.click('.canvas-optimize');await s.wait("!document.querySelector('.stitch-dialog')&&!document.querySelector('.project-name').disabled");await s.ready();}
 await openSettings();assert.equal(await s.js("document.querySelectorAll('.optimization-settings button').length"),0,'zero images has zero selection buttons');assert.equal(await s.js("document.querySelectorAll('.optimization-settings input').length"),0);await s.click('[aria-label="设置优化裁剪"]');
 await s.edit('#stitch-height',240);await s.importFiles(['01-alpine.jpg','02-cabin.jpg','03-coast.jpg','04-alpine.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name)));
 const original=await s.load(),ids=original.images.map(i=>i.id),beforeCalls=s.calls();await openSettings();
 assert.deepEqual(await s.js("[...document.querySelectorAll('.optimization-image-buttons button')].map(b=>b.textContent)"),['1','2','3','4']);
 assert.equal(await s.js("document.querySelector('[aria-label=\"第 3 张特殊裁剪\"]').getAttribute('aria-pressed')"),'true');
 assert.deepEqual(await s.js("[document.querySelector('[aria-label=\"第 3 张优化顶部裁剪比例\"]').value,document.querySelector('[aria-label=\"第 3 张优化左右裁剪像素\"]').value]"),['15','100']);
 await toggle(3);await toggle(1);await toggle(4);await s.edit(top(1),10);await s.edit(sides(1),50);await s.edit(top(4),20);await s.edit(sides(4),150);await s.ready();
 const configured=await s.load();assert.deepEqual(configured.optimization.specialCrops[ids[0]],{enabled:true,topPercent:10,sidePixels:50});assert.deepEqual(configured.optimization.specialCrops[ids[3]],{enabled:true,topPercent:20,sidePixels:150});assert.equal(configured.optimization.specialCrops[ids[2]].enabled,false);
 assert.deepEqual(configured.edits,original.edits);assert.deepEqual(configured.positions,original.positions);assert.equal(s.calls(),beforeCalls,'changing independent parameters never encodes a ready preview');assert.equal(await s.js("document.querySelectorAll('.optimization-image-crop').length"),2);await s.capture('multi-crop-settings.png');
 await optimize();let p=await s.load();assert.deepEqual(p.edits[ids[0]].edges,{left:50,right:50,top:410,bottom:0});assert.deepEqual(p.edits[ids[3]].edges,{left:150,right:150,top:768,bottom:0});assert.equal(p.edits[ids[1]].fraction,p.edits[ids[2]].fraction);assert.deepEqual(p.canvas,original.canvas);const multiOutput=await s.save('independent-multi-crops');assert.deepEqual([multiOutput.width,multiOutput.height],[600,240]);
 await reopen();await openSettings();assert.deepEqual(await s.js("[...document.querySelectorAll('.optimization-image-buttons [aria-pressed=true]')].map(e=>e.textContent)"),['1','4']);
 assert.deepEqual(await s.js("[document.querySelector('[aria-label=\"第 1 张优化顶部裁剪比例\"]').value,document.querySelector('[aria-label=\"第 4 张优化顶部裁剪比例\"]').value]"),['10','20']);
 await s.js("(()=>{const e=document.querySelector('.stitch-layer');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));})()");await s.ready();p=await s.load();assert.deepEqual(p.images.map(i=>i.id),[ids[1],ids[0],ids[2],ids[3]]);assert.deepEqual(p.optimization,configured.optimization);assert.equal(await s.js("document.querySelector('[aria-label=\"第 2 张优化顶部裁剪比例\"]').value"),'10');assert.deepEqual(p.edits[ids[0]].edges,{left:50,right:50,top:410,bottom:0});
 const calls=s.calls();await s.edit(top(2),100);await s.wait("document.querySelector('.optimization-settings [role=alert]')?.textContent.includes('小于 100')");assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);assert.equal((await s.load()).optimization.specialCrops[ids[0]].topPercent,10);assert.equal(s.calls(),calls);
 await toggle(2);assert.equal((await s.load()).optimization.specialCrops[ids[0]].topPercent,10);await toggle(2);assert.equal(await s.js("document.querySelector('[aria-label=\"第 2 张优化顶部裁剪比例\"]').value"),'10');
 await toggle(2);await toggle(4);assert.equal(await s.js("document.querySelectorAll('.optimization-image-crop').length"),0);await optimize();p=await s.load();assert.ok(p.images.every(image=>p.edits[image.id].edges===undefined));
 await reopen();await openSettings();assert.equal(await s.js("document.querySelectorAll('.optimization-image-buttons [aria-pressed=true]').length"),0);await toggle(3);assert.equal(await s.js("document.querySelector('[aria-label=\"第 3 张优化顶部裁剪比例\"]').value"),'15');await optimize();
 const restored=await s.load();assert.deepEqual(restored.edits[ids[2]].edges,{left:100,right:100,top:576,bottom:0});
 const transformations=[];
 for(const [name,factor,shift] of [['enlarge',.25,false],['shrink',-.2,false],['stretch',.2,true]]){
  const before=await s.load();await s.js("document.querySelector('.stitch-layer').blur();document.querySelector('.stitch-layer').focus()");await s.wait("!!document.querySelector('[data-handle=e]')");
  const width=await s.js("document.querySelector('.stitch-layer').getBoundingClientRect().width");await s.drag('[data-handle=e]',width*factor,0,shift);
  const resized=await s.load();assert.notDeepEqual(resized.positions,before.positions);assert.deepEqual(resized.edits,before.edits);assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),false);
  if(name==='enlarge'){await reopen();assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),false);}
  await optimize();const next=await s.load();assert.equal(await s.js("document.querySelector('.canvas-optimize').disabled"),true);assert.deepEqual(next.canvas,resized.canvas);assert.deepEqual(next.export,resized.export);assert.deepEqual(next.importSizes,restored.importSizes);
  let x=0;for(const image of next.images){const pose=next.positions[image.id];assert.ok(Math.abs(pose.x-x)<1e-8);assert.ok(Math.abs(pose.y)<1e-8);assert.ok(Math.abs(pose.height-next.canvas.height)<1e-8);x+=pose.width;}assert.ok(Math.abs(x-next.canvas.width)<1e-8);transformations.push({name,canvas:next.canvas});
 }
 for(const image of original.images)assert.ok((await s.store.readAsset(image.assetId)).equals(await fs.readFile(path.resolve('artifacts/stitch-fixtures',image.name))));
 const output=await s.save('multi-image-special-crops'),savedFirst=(await s.load()).optimization;
 await s.createBlankCanvas();await s.wait("!!document.querySelector('[aria-label=\"添加画布图片\"]')&&!document.querySelector('.project-name').disabled");await s.edit('#stitch-height',240);await s.importFiles([path.resolve('artifacts/stitch-fixtures/01-alpine.jpg')]);await openSettings();assert.equal(await s.js("document.querySelectorAll('.optimization-image-buttons button').length"),1);assert.equal(await s.js("document.querySelectorAll('.optimization-image-crop').length"),0);await toggle(1);await s.edit(top(1),5);await s.edit(sides(1),10);await s.ready();
 await s.click('[aria-label="打开画布 图像 1"]');await s.ready();assert.deepEqual((await s.load()).optimization,savedFirst);
 await s.finish({passed:true,exactButtonsForZeroOneFourImages:true,multipleIndependentCrops:true,defaultThird15Percent:true,settingsOnlyNoCropOrEncode:true,autosaveAndReopen:true,parametersFollowImageAfterReorder:true,invalidNotSaved:true,deselectInvalidRecoversSavedValues:true,noSelectionUniformCrop:true,noSelectionSurvivesReopen:true,independentProjects:true,resizeReopensOptimization:true,originalsUnchanged:true,transformations,multiOutput,output});
})().catch(error=>{console.error(error);app.exit(1);});
