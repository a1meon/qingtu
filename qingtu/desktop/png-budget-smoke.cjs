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
  const {win,service,store}=await start({testFolder:folder,projectRoot:path.join(root,'projects'),testFiles:[source],hidden:true});
  win.webContents.setBackgroundThrottling(false);
  const js=expr=>win.webContents.executeJavaScript(expr),reports=[];
  const edit=(selector,value)=>js(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(win,"!!document.querySelector('.add-tile')");await js("document.querySelector('.add-tile').click()");
  await waitFor(win,"document.querySelector('.processed-label')?.textContent.includes('未改动')");
  await js("document.querySelector('#unit').click()");await waitFor(win,"!!document.querySelector('[role=option]')");await js("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='KB').click()");await edit('#target-size',1);
  await waitFor(win,"document.querySelector('.module-content:not([hidden]) .preview-info')?.textContent.includes('等比调整')&&document.querySelector('.processed-label')?.textContent==='处理后'");
  const compression=[...service.files.values()][0].last.result;
  assert.equal(compression.autoResized,true);assert.ok(compression.bytes<=1000);assert.ok(compression.width<width);assert.equal(compression.requestedWidth,width);assert.equal(await js("document.querySelector('#width').value"),'300','requested setting stays independent of actual export');
  await fs.mkdir('artifacts/png-budget',{recursive:true});await win.webContents.capturePage().then(image=>fs.writeFile('artifacts/png-budget/compression-ui.png',image.toPNG()));
  await js("document.querySelector('.export-button').click()");await waitFor(win,"document.querySelector('.notice')?.textContent.includes('1 张已等比调整尺寸')");
  reports.push({module:'compression',width:compression.width,height:compression.height,bytes:compression.bytes,requested:[width,height],actualSizeVisible:true});
  await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");await waitFor(win,"!!document.querySelector('[aria-label=\"添加拼接图片\"]')");await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");
  await waitFor(win,"!!document.querySelector('.stitch-layer')&&!document.querySelector('.project-name').disabled");await edit('#stitch-long-edge',600);
  await js("document.querySelector('[aria-label=\"拼接大小单位\"]').click()");await waitFor(win,"!!document.querySelector('[role=option]')");await js("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='KB').click()");await edit('#stitch-target',1);
  await waitFor(win,"document.querySelector('.stitch-info')?.textContent.includes('等比调整')&&!document.querySelector('.stitch-info')?.textContent.includes('计算中')");
  const text=await js("document.querySelector('.stitch-info').textContent"),project=await store.load((await store.list())[0].id);
  assert.equal(await js("!!document.querySelector('.stitch-output-preview')&&getComputedStyle(document.querySelector('.stitch-layer img')).visibility==='hidden'"),true,'idle canvas displays the decoded small export, not the sharp original thumbnail');
  const point=await js("(()=>{const r=document.querySelector('.stitch-layer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+20,y:point.y,buttons:1});
  await waitFor(win,"document.querySelector('.stitch-canvas').dataset.interacting==='true'");assert.equal(await js("getComputedStyle(document.querySelector('.stitch-layer img')).visibility"),'visible');
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+20,y:point.y,button:'left',buttons:0,clickCount:1});win.webContents.debugger.detach();
  await waitFor(win,"!document.querySelector('.stitch-canvas').dataset.interacting");assert.equal(await js("getComputedStyle(document.querySelector('.stitch-layer img')).visibility"),'hidden','decoded output returns after native drag');
  assert.equal(project.export.longEdge,600);assert.equal(project.export.targetBytes,1000);assert.deepEqual([project.images[0].width,project.images[0].height],[width,height]);assert.ok((await store.readAsset(project.images[0].assetId)).equals(await fs.readFile(source)));
  await win.webContents.capturePage().then(image=>fs.writeFile('artifacts/png-budget/stitch-ui.png',image.toPNG()));
  await js("document.querySelector('.module-content:not([hidden]) .export-button').click()");await waitFor(win,"document.querySelector('.notice')?.textContent.includes('等比调整')");
  const files=await fs.readdir(folder);assert.equal(files.length,2);
  for(const filename of files){const file=path.join(folder,filename),meta=await sharp(file).metadata(),bytes=(await fs.stat(file)).size;assert.ok(bytes<=1000);assert.equal(meta.format,'png');assert.equal(meta.isPalette,false);assert.equal(meta.hasAlpha,true);assert.equal(meta.width*2,meta.height*5);}
  const stitched=files.find(file=>file!=='noisy-alpha-qingtu.png'),meta=await sharp(path.join(folder,stitched)).metadata();assert.ok(text.includes(`${meta.width} × ${meta.height}`));
  reports.push({module:'stitch',width:meta.width,height:meta.height,bytes:(await fs.stat(path.join(folder,stitched))).size,requested:[600,240],actualSizeVisible:true,settingsAndOriginalRetained:true});
  await fs.writeFile('artifacts/png-budget/ui-report.json',JSON.stringify({passed:true,platform:process.platform,reports},null,2));console.log(JSON.stringify({passed:true,reports}));
  win.destroy();app.quit();
 }finally{
  const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('qingtu-png-ui-'))throw new Error('Unsafe temporary cleanup');
  await fs.rm(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);app.exit(1);});
