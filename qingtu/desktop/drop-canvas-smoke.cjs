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
 let p=await s.load();const owner=p.id;assert.equal(p.name,'drop-1','first imported filename names the image');assert.equal((await s.store.list()).length,1,'a repeated drop during import does not create another canvas');assert.deepEqual(p.images.map(i=>i.name),originals.slice(0,2).map(i=>i.name));
 await s.click('[aria-label=解锁画布宽高比例]');
 await s.edit('#stitch-width',240);await s.edit('#stitch-height',120);await s.ready();await drop(originals.slice(2));await s.wait("document.querySelectorAll('.stitch-layer').length===3");await s.ready();p=await s.load();assert.equal(p.id,owner);assert.equal((await s.store.list()).length,1);assert.deepEqual(p.canvas,{width:240,height:120},'appending a drop preserves the manually entered canvas size');
 for(let i=0;i<originals.length;i++)assert.ok((await s.store.readAsset(p.images[i].assetId)).equals(originals[i].bytes));
 await s.click('[aria-label="设置优化裁剪"]');await s.wait("!!document.querySelector('.optimization-image-buttons')");assert.deepEqual(await s.js("[...document.querySelectorAll('.optimization-image-buttons button')].map(b=>b.textContent)"),['1','2','3']);assert.equal(await s.js("document.querySelector('[aria-label=\"第 2 张特殊裁剪\"]').getAttribute('aria-pressed')"),'true');await s.capture('auto-created-canvas.png');await s.click('[aria-label="设置优化裁剪"]');
 const loaded=new Promise(resolve=>s.win.webContents.once('did-finish-load',resolve));s.win.webContents.reload();await loaded;await s.wait("!!document.querySelector('[aria-label=\"图像编辑\"]')");await s.click('[aria-label="图像编辑"]');await s.ready();assert.equal((await s.load()).id,owner);assert.equal((await s.load()).images.length,3);
 await choosePreset('21:9');
 const wide=await s.load();
 for(const pose of Object.values(wide.positions)){assert.equal(pose.y,0);assert.equal(pose.height,2571);}
 const zoomControls='.module-content:not([hidden]) .canvas-viewport-controls';
 await s.click(zoomControls+' [aria-label="放大视图"]');
 assert.equal(await s.js(`document.querySelector('${zoomControls} output').textContent`),'125%');
 await choosePreset('原图比例');
 assert.equal(await s.js(`document.querySelector('${zoomControls} output').textContent`),'100%');
 const restored=await s.load();
 assert.deepEqual(restored.images.map(image=>image.id),p.images.map(image=>image.id));
 const output=await s.save('automatic-drop-canvas');
 const row=await sharp(output.file).extract({left:0,top:Math.floor(output.height/2),width:output.width,height:1}).ensureAlpha().raw().toBuffer();
 const bands=[];
 for(let x=0;x<output.width;x++){
  const rgba=row.readUInt32BE(4*x);
  if(bands.at(-1)!==rgba)bands.push(rgba);
 }
 assert.deepEqual(bands,[0xff0000ff,0x0000ffff,0x008000ff],'the exported PNG contains all three complete colour bands with no transparent seams');
 await s.click('[aria-label="新建图像"]');
 await s.wait("document.querySelector('.stitch-create-empty .import-button')?.textContent==='添加图片'");
 assert.equal((await s.store.list()).length,1,'the chooser creates no placeholder project');
 const panorama=await sharp({create:{width:5101,height:211,channels:3,background:'#65a788'}}).png().toBuffer();
 await drop([{bytes:panorama,name:'second.v2.PNG'}]);
 await s.wait("document.querySelectorAll('.stitch-layer').length===1");await s.ready();
 const direct=await s.load();assert.deepEqual(direct.canvas,{width:5101,height:211});
 assert.deepEqual(direct.positions[direct.images[0].id],{x:0,y:0,width:5101,height:211});
 assert.equal(await s.js("document.querySelector('#canvas-preset').textContent"),'原图比例');
 assert.equal(await s.js("document.querySelector('[aria-label=解锁画布宽高比例]').getAttribute('aria-pressed')"),'true');
 await s.edit('#stitch-width',2550);await s.ready();
 const custom=(await s.load()).canvas;assert.deepEqual(custom,{width:2550,height:106});
 async function choosePreset(label){
  await s.click('#canvas-preset');
  await s.js(`[...document.querySelectorAll('#canvas-preset-list [role=option]')].find(el=>el.querySelector('span').textContent===${JSON.stringify(label)}).click()`);
  await s.wait(`document.querySelector('#canvas-preset').textContent===${JSON.stringify(label)}`);await s.ready();
 }
 await choosePreset('2.4:1');await choosePreset('自定义');assert.deepEqual((await s.load()).canvas,custom);
 await choosePreset('原图比例');assert.deepEqual((await s.load()).canvas,direct.canvas);
 const exported=await s.save('original-panorama');assert.deepEqual(await fs.readFile(exported.file),panorama);
 assert.equal((await s.load()).name,'second.v2');assert.equal((await s.store.load(owner)).images.length,3);
 assert.equal((await s.store.list()).length,2,'import from the chooser creates a separate project');
 await s.finish({passed:true,noCanvasDropCreatesOne:true,multipleDroppedOriginals:true,overlappingDropDoesNotDuplicate:true,laterDropAppends:true,internalAndEmptyIgnored:true,numberOnlyButtons:true,defaultSecondForThree:true,autosaveReopen:true,originalsUnchanged:true,output});
})().catch(error=>{console.error(error);app.exit(1);});
