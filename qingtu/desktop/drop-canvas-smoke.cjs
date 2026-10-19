const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-drop-canvas-','drop-canvas',{createCanvas:false});
 const sharp=(await import('sharp')).default;
 const originals=await Promise.all([['red',64,64],['blue',64,64],['green',32,64]].map(async([background,width,height],i)=>({name:`drop-${i+1}.png`,bytes:await sharp({create:{width,height,channels:3,background}}).png().toBuffer()})));
 const drop=async(items,{internal=false,repeat=false}={})=>s.js(`(()=>{const transfer=new DataTransfer();for(const item of ${JSON.stringify(items.map(item=>({name:item.name,bytes:item.bytes.toString('base64')})))})transfer.items.add(new File([Uint8Array.from(atob(item.bytes),c=>c.charCodeAt(0))],item.name,{type:'image/png'}));if(${internal})transfer.setData('application/x-qingtu-preview','1');const target=document.querySelector('.app');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));if(${repeat})target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));})()`);
 await drop([]);await drop(originals.slice(0,1),{internal:true});assert.equal((await s.store.list()).length,0,'empty and internal preview drops never create a canvas');
 await drop(originals.slice(0,2),{repeat:true});
 await s.wait("document.querySelectorAll('.stitch-layer').length===2");await s.ready();
 let p=await s.load();const owner=p.id;assert.equal((await s.store.list()).length,1,'a repeated drop during import does not create another canvas');assert.deepEqual(p.images.map(i=>i.name),originals.slice(0,2).map(i=>i.name));
 await s.edit('#stitch-width',240);await s.edit('#stitch-height',120);await s.ready();await drop(originals.slice(2));await s.wait("document.querySelectorAll('.stitch-layer').length===3");await s.ready();p=await s.load();assert.equal(p.id,owner);assert.equal((await s.store.list()).length,1);assert.deepEqual(p.canvas,{width:300,height:120});
 for(let i=0;i<originals.length;i++)assert.ok((await s.store.readAsset(p.images[i].assetId)).equals(originals[i].bytes));
 await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-image-buttons')");assert.deepEqual(await s.js("[...document.querySelectorAll('.optimization-image-buttons button')].map(b=>b.textContent)"),['1','2','3']);assert.equal(await s.js("document.querySelector('[aria-label=\"第 3 张特殊裁剪\"]').getAttribute('aria-pressed')"),'true');await s.capture('auto-created-canvas.png');await s.click('[aria-label="设置优化裁剪"]');
 const loaded=new Promise(resolve=>s.win.webContents.once('did-finish-load',resolve));s.win.webContents.reload();await loaded;await s.wait("!!document.querySelector('[aria-label=\"图像编辑\"]')");await s.click('[aria-label="图像编辑"]');await s.ready();assert.equal((await s.load()).id,owner);assert.equal((await s.load()).images.length,3);
 const output=await s.save('automatic-drop-canvas');await s.finish({passed:true,noCanvasDropCreatesOne:true,multipleDroppedOriginals:true,overlappingDropDoesNotDuplicate:true,laterDropAppends:true,internalAndEmptyIgnored:true,numberOnlyButtons:true,defaultThirdRetained:true,autosaveReopen:true,originalsUnchanged:true,output});
})().catch(error=>{console.error(error);app.exit(1);});
