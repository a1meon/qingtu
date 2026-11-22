const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-reset-zoom-','reset-zoom'),sharp=(await import('sharp')).default;
 const files=await Promise.all(['first','second'].map(async(name,index)=>{const file=path.join(s.root,name+'.png');await sharp({create:{width:300,height:400,channels:4,background:index?'#c78360':'#719db8'}}).composite([{input:Buffer.from('<svg width="300" height="400"><path d="M0 0L300 400M300 0L0 400" stroke="white" stroke-width="6"/></svg>')}]).png().toFile(file);return file;}));
 await s.loadAutoCanvas(240);await s.importFiles(files);const initial=await s.load(),id=initial.images[0].id,baseline=initial.importSizes[id];assert.deepEqual(baseline,{width:180,height:240});
 await s.click('[data-layout="free"]');await s.ready();await s.click('[aria-label=解锁画布宽高比例]');
 await s.edit('#stitch-height',480);await s.edit('#stitch-width',600);await s.ready();
 await s.js("document.querySelector('.stitch-layer').focus()");await s.wait("!!document.querySelector('[data-handle=se]')");
 const scale=await s.js(`document.querySelector('.stitch-layer').getBoundingClientRect().height/${baseline.height}`);
 await s.drag('[data-handle=se]',baseline.width*scale*.6,baseline.height*scale*.6);await s.drag('.stitch-layer.selected',-30,22);
 const enlarged=await s.load(),pose=enlarged.positions[id];assert.ok(pose.width>baseline.width*1.3);assert.ok(pose.height>baseline.height*1.3);await s.capture('before-reset.png');
 await s.click('.canvas-reset');await s.ready();assert.equal(await s.js("!!document.querySelector('.stitch-dialog')"),false);
 await s.wait("document.querySelector('.notice.success')?.textContent.includes('已重置画布，视图已恢复至 100%')");
 await s.wait("!document.querySelector('.notice.success')");
 const restored=await s.load(),expected={x:pose.x+pose.width/2-baseline.width/2,y:pose.y+pose.height/2-baseline.height/2,...baseline};assert.deepEqual(restored.positions[id],expected);assert.deepEqual(restored.canvas,enlarged.canvas);assert.deepEqual(restored.export,enlarged.export);assert.deepEqual(restored.edits,{});await s.capture('after-reset.png');
 const cdp=(method,args)=>s.win.webContents.debugger.sendCommand(method,args);
 s.win.webContents.debugger.attach('1.3');
 try{
  await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});await s.js('document.activeElement.blur()');
  async function shortcut(modifiers){
   for(const type of ['rawKeyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:modifiers&8?'Z':'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers});
   await s.ready();
  }
  for(const modifier of [2,4]){
   await shortcut(modifier);assert.deepEqual((await s.load()).positions,enlarged.positions);
   await shortcut(modifier|8);assert.deepEqual((await s.load()).positions,restored.positions);
  }
 }finally{s.win.webContents.debugger.detach();}
 const editMenu=require('electron').Menu.getApplicationMenu().items.find(item=>item.label==='编辑').submenu;
 editMenu.items.find(item=>item.label==='撤销').click();await s.ready();assert.deepEqual((await s.load()).positions,enlarged.positions);
 editMenu.items.find(item=>item.label==='重做').click();await s.ready();assert.deepEqual((await s.load()).positions,restored.positions);
 await s.click('[data-layout="horizontal"]');await s.ready();let row=await s.load();assert.deepEqual(row.images.map(i=>i.id),initial.initialOrder);assert.equal(row.positions[row.images[1].id].x,row.positions[id].width);assert.deepEqual(row.importSizes,initial.importSizes);
 await s.click('[data-layout="free"]');await s.ready();assert.deepEqual((await s.load()).positions,restored.positions);
 await s.win.webContents.reload();await s.wait("!!document.querySelector('[aria-label=\"图像编辑\"]')");await s.click('[aria-label="图像编辑"]');await s.ready();const reopened=await s.load();assert.deepEqual(reopened.positions,restored.positions);assert.deepEqual(reopened.importSizes,initial.importSizes);
 for(let n=0;n<initial.images.length;n++)assert.ok((await s.store.readAsset(initial.images[n].assetId)).equals(await fs.readFile(files[n])));
 const output=await s.save('reset-import-size');await s.finish({passed:true,actualResizeAndMove:true,immediateReset:true,undoRedo:true,restoresImportedSize:true,freeCentreRetained:true,manualCanvasRetained:true,structuredReflow:true,layoutSwitchNoOldZoom:true,autosaveReopen:true,originalsUnchanged:true,baseline,before:pose,after:reopened.positions[id],output});
})().catch(error=>{console.error(error);app.exit(1);});
