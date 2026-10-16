const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-selected-export-','selected-export');
 assert.equal(await s.js("document.querySelector('#stitch-target').value"),'30','new stitching canvases start with a 30 MB export budget');
 assert.equal(await s.js("document.querySelectorAll('.canvas-card input[type=checkbox],.canvas-export-all input').length"),0,'an empty workspace offers no export checkboxes');
 const samples=['alpine-lake.jpg','forest-cabin.jpg','coastline.jpg'];
 for(let n=0;n<3;n++){
  if(n){await s.click('[aria-label="新建画布"]');await s.wait("!!document.querySelector('[aria-label=\"添加拼接图片\"]')&&!document.querySelector('.project-name').disabled");}
  await s.edit('#stitch-height',120);await s.importFiles([path.resolve('public/samples',samples[n])]);await s.edit('#stitch-width',240+n*20);await s.ready();
 }
 assert.equal(await s.js("document.querySelectorAll('.canvas-card input[type=checkbox]').length"),3,'each canvas offers an independent export choice');
 assert.ok(await s.js("[...document.querySelectorAll('.canvas-export-select')].every(e=>{const r=e.getBoundingClientRect(),c=e.closest('.canvas-card').getBoundingClientRect(),s=getComputedStyle(e);return r.left>c.left+c.width/2&&r.right<=c.right&&s.boxShadow==='none'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.borderWidth==='0px'})"),'checkboxes sit on the right without a surrounding badge');
 const original=await Promise.all((await s.store.list()).map(p=>s.store.load(p.id)));
 await s.click('[aria-label="新建画布"]');await s.wait("document.querySelectorAll('.canvas-card').length===4&&document.querySelector('.project-name').value==='图像 4'&&document.querySelector('.save-status').textContent==='已自动保存'&&!document.querySelector('.project-name').disabled");
 assert.equal(await s.js("document.querySelector('[aria-label=\"选择导出 图像 4\"]')"),null,'empty canvases have no export checkbox');
 assert.equal(await s.js("document.querySelector('.stitch-stage').parentElement.querySelector('.export-button').textContent"),'导出 3 张图像');
 await s.click('[aria-label="全选导出图像"]');assert.equal(await s.js("document.querySelector('.stitch-stage').parentElement.querySelector('.export-button').disabled"),true);
 const calls=s.calls();await s.js("document.querySelector('[aria-label=\"选择导出 图像 1\"]').focus()");
 s.win.webContents.debugger.attach('1.3');try{for(const type of ['keyDown','keyUp'])await s.win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});}finally{s.win.webContents.debugger.detach();}
 await s.wait("document.querySelector('[aria-label=\"选择导出 图像 1\"]').checked");
 assert.equal(await s.js("document.querySelector('.project-name').value"),'图像 4','selecting export does not open a different canvas');assert.equal(s.calls(),calls);
 assert.equal(await s.js("document.querySelector('[aria-label=\"全选导出图像\"]').indeterminate"),true);
 const saved=[],save=s.service.save.bind(s.service);let release,reached;
 const held=new Promise(resolve=>release=resolve),written=new Promise(resolve=>reached=resolve);
 s.service.save=async(...args)=>{const result=await save(...args);saved.push(result);if(saved.length===1){reached();await held;}return result;};
 await s.js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,shiftKey:true,bubbles:true}))");await Promise.race([written,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Selected export did not write its first file')),30000))]);
 assert.equal(await s.js("[...document.querySelectorAll('.canvas-card input[type=checkbox],.canvas-export-all input')].every(e=>e.disabled)"),true,'batch scope stays locked during export');release();
 await s.wait("document.querySelector('.notice')?.textContent.includes('已导出 1 张图像')&&!document.querySelector('.project-name').disabled");assert.equal(saved.length,1);
 const sharp=(await import('sharp')).default;
 assert.equal((await sharp(saved[0].path).metadata()).width,240,'single export writes only the chosen canvas');
 await s.click('[aria-label="打开画布 图像 3"]');await s.ready();await s.edit('#stitch-width',301);await s.wait("document.querySelector('.stitch-stage').parentElement.querySelector('[role=alert]')?.textContent.includes('比例超过 2.5')&&document.querySelector('.save-status').textContent==='已自动保存'");
 await s.click('[aria-label="选择导出 图像 2"]');assert.equal(await s.js("document.querySelector('.stitch-stage').parentElement.querySelector('.export-button').disabled"),false,'an unselected invalid canvas does not block selected valid canvases');
 await s.click('[aria-label="压缩调整"]');await s.click('[aria-label="图像拼接"]');assert.deepEqual(await s.js("[...document.querySelectorAll('.canvas-card input:checked')].map(e=>e.getAttribute('aria-label')).sort()"),['选择导出 图像 1','选择导出 图像 2']);
 await s.capture('two-selected.png');await s.click('.stitch-stage + .inspector-shell .export-button');await s.wait("document.querySelector('.notice')?.textContent.includes('已导出 2 张图像')&&!document.querySelector('.project-name').disabled");assert.equal(saved.length,3);
 const outputs=[];for(const item of saved){const buffer=await fs.readFile(item.path),meta=await sharp(buffer).metadata();assert.equal(buffer.length,item.bytes);assert.ok(item.bytes<=10000000);assert.equal(meta.format,'png');outputs.push({file:path.basename(item.path),width:meta.width,height:meta.height,bytes:item.bytes});}
 assert.deepEqual(outputs.map(o=>o.width).sort((a,b)=>a-b),[240,240,260]);
 await s.edit('#stitch-width',280);await s.ready();await s.click('[aria-label="关闭拼接提示"]');await s.capture('two-selected.png');
 const beforeSelection=await s.load(),beforeSelectionCalls=s.calls();await s.click('[aria-label="全选导出图像"]');assert.equal(await s.js("document.querySelectorAll('.canvas-card input:checked').length"),3);await s.click('[aria-label="全选导出图像"]');assert.equal(await s.js("document.querySelectorAll('.canvas-card input:checked').length"),0);await s.ready();assert.equal(s.calls(),beforeSelectionCalls,'changing export choices never encodes the ready active canvas');assert.deepEqual(await s.load(),beforeSelection,'export selection never saves project edits');
 for(const before of original)for(const image of before.images)assert.ok((await s.store.readAsset(image.assetId)).equals(await fs.readFile(path.resolve('public/samples',image.name))));
 await s.click('[aria-label="选择导出 图像 2"]');await s.js("document.querySelector('[aria-label=\"打开画布 图像 2\"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:600}))");await s.wait("!!document.querySelector('.canvas-context-menu')");await s.click('.canvas-context-menu button:last-child');await s.wait("!!document.querySelector('.stitch-dialog')");await s.click('.dialog-confirm');await s.wait("!document.querySelector('.stitch-dialog')&&document.querySelectorAll('.canvas-card').length===3&&!document.querySelector('.project-name').disabled");
 assert.equal(await s.js("document.querySelector('.stitch-stage').parentElement.querySelector('.export-button').textContent"),'导出 0 张图像');assert.equal(await s.js("document.querySelector('.stitch-stage').parentElement.querySelector('.export-button').disabled"),true,'deleting the only selected canvas never falls back to exporting other canvases');
 await s.finish({passed:true,singleAndMultipleExactFiles:true,keyboardSelectionAndExport:true,selectionDoesNotOpenOrEncode:true,emptySkipped:true,selectAllAndNone:true,mixedState:true,moduleSwitchPreservesSelection:true,unselectedInvalidCanvasDoesNotBlock:true,selectionLockedDuringExport:true,deletedSelectionDoesNotExportOthers:true,sourceBytesUnchanged:true,outputs});
})().catch(error=>{console.error(error);app.exit(1);});
