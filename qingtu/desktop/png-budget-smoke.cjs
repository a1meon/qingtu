const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win,expr){for(let n=0;n<600;n++){if(await win.webContents.executeJavaScript(expr))return;await pause(100);}throw new Error('Timed out: '+expr);}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-png-ui-'));
 try{
  const sharp=(await import('sharp')).default,width=300,height=120,data=Buffer.alloc(width*height*4);let seed=712;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
  const source=path.join(root,'noisy-alpha.png');await sharp(data,{raw:{width,height,channels:4}}).png().toFile(source);
  const folder=path.join(root,'exports');await fs.mkdir(folder);
  const {win,store}=await start({offscreen:true,testFolder:folder,projectRoot:path.join(root,'projects'),testFiles:[source],hidden:true});
  win.webContents.setBackgroundThrottling(false);
  const js=expr=>win.webContents.executeJavaScript(expr),reports=[];
  const edit=(selector,value)=>js(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(win,"!!document.querySelector('.add-tile')");await js("document.querySelector('[aria-label=\"压缩调整\"]').click()");await js("document.querySelector('.add-tile').click()");
  await waitFor(win,"document.querySelector('.processed-label')?.textContent.includes('未改动')");
  await js("document.querySelector('#unit').click()");await waitFor(win,"!!document.querySelector('[role=option]')");await js("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='KB').click()");await edit('#target-size',1);
  await waitFor(win,"document.querySelector('.processed-label')?.textContent==='处理后'&&document.querySelector('.module-content:not([hidden]) .size-comparison')?.textContent.includes(' B')");
  assert.equal(await js("document.querySelector('#width').value"),'300');
  assert.equal(await js("document.querySelector('#height').value"),'120');
  await fs.mkdir('artifacts/png-budget',{recursive:true});await win.webContents.capturePage().then(image=>fs.writeFile('artifacts/png-budget/compression-ui.png',image.toPNG()));
  await js("document.querySelector('.export-button').click()");await waitFor(win,"document.querySelector('.notice.success')?.textContent.includes('已导出 1 张')");
  const [compressed]=await fs.readdir(folder);
  async function verifyFile(filename,width,height,limit){
   const file=path.join(folder,filename),meta=await sharp(file).metadata(),bytes=(await fs.stat(file)).size;
   assert.equal(meta.format,'png');assert.equal(meta.hasAlpha,true);
   assert.deepEqual([meta.width,meta.height],[width,height]);assert.ok(bytes<=limit);
   return {width,height,bytes,limit};
  }
  reports.push({module:'compression',...await verifyFile(compressed,width,height,1000)});
  await js("document.querySelector('[aria-label=\"图像编辑\"]').click()");await waitFor(win,"!!document.querySelector('[aria-label=\"新建图像\"]')&&!document.querySelector('[aria-label=\"新建图像\"]').disabled");await js("document.querySelector('.blank-canvas-button').click()");await waitFor(win,"document.querySelector('[aria-label=\"添加画布图片\"]')?.disabled===false");await edit('#stitch-width',576);await edit('#stitch-height',240);await js("document.querySelector('[aria-label=\"添加画布图片\"]').click()");
  await waitFor(win,"!!document.querySelector('.stitch-layer')&&!document.querySelector('.project-name').disabled");
  await js("document.querySelector('[aria-label=\"画布大小单位\"]').click()");await waitFor(win,"!!document.querySelector('[role=option]')");await js("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='KB').click()");await edit('#stitch-target',1);
  await waitFor(win,"document.querySelector('.stitch-output-preview')&&document.querySelector('.stitch-info .preview-status')?.textContent.includes('减色')&&document.querySelector('.save-status').textContent==='已自动保存'");
  const project=await store.load((await store.list())[0].id);
  assert.equal(await js("getComputedStyle(document.querySelector('.stitch-layer img')).visibility"),'hidden');
  const point=await js("(()=>{const r=document.querySelector('.stitch-layer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+20,y:point.y,buttons:1});
  await waitFor(win,"document.querySelector('.stitch-canvas').dataset.interacting==='reorder'");assert.equal(await js("getComputedStyle(document.querySelector('.stitch-layer.selected img')).visibility"),'visible','even a single image follows the pointer during a reorder gesture');
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+20,y:point.y,button:'left',buttons:0,clickCount:1});win.webContents.debugger.detach();
  await waitFor(win,"!document.querySelector('.stitch-canvas').dataset.interacting&&!!document.querySelector('.stitch-output-preview')");assert.equal(await js("getComputedStyle(document.querySelector('.stitch-layer img')).visibility"),'hidden','decoded output returns after native drag');
  assert.equal(project.export.longEdge,576);assert.equal(project.export.targetBytes,1000);assert.deepEqual([project.images[0].width,project.images[0].height],[width,height]);assert.ok((await store.readAsset(project.images[0].assetId)).equals(await fs.readFile(source)));
  await win.webContents.capturePage().then(image=>fs.writeFile('artifacts/png-budget/stitch-ui.png',image.toPNG()));
  await js("document.querySelector('.module-content:not([hidden]) .export-button').click()");await waitFor(win,"document.querySelector('.notice')?.textContent.includes('已导出 1')");
  const files=await fs.readdir(folder);assert.equal(files.length,2);
  reports.push({module:'stitch',...await verifyFile(files.find(name=>name!==compressed),576,240,1000)});
  await fs.writeFile('artifacts/png-budget/ui-report.json',JSON.stringify({passed:true,platform:process.platform,reports},null,2));console.log(JSON.stringify({passed:true,reports}));
  win.destroy();app.quit();
 }finally{
  const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('qingtu-png-ui-'))throw new Error('Unsafe temporary cleanup');
  await fs.rm(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);app.exit(1);});
