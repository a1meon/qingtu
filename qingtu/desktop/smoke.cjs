const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {start}=require(process.env.QINGTU_TEST_APP_ROOT?path.join(process.env.QINGTU_TEST_APP_ROOT,'desktop/main.cjs'):'./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win,expr){for(let n=0;n<100;n++){if(await win.webContents.executeJavaScript(expr))return;await pause(100);}throw new Error('Timed out: '+expr);}
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-native-'));
 try{
  const {win,service}=await start({testFolder:temp,testFiles:[path.join(__dirname,'../public/samples/alpine-lake.jpg')],hidden:true});
  win.webContents.setBackgroundThrottling(false);
  const errors=[];
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  await waitFor(win,"!!document.querySelector('.export-button') && !document.querySelector('.add-tile').disabled");
  if(process.platform==='darwin'){
   assert.deepEqual(win.getWindowButtonPosition(),{x:14,y:18});
   assert.equal(await win.webContents.executeJavaScript("document.querySelector('.brand').getBoundingClientRect().left >= 90 && !document.querySelector('.mac-controls')"),true);
  }
  assert.equal(await win.webContents.executeJavaScript("typeof window.require"),'undefined');
  assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.module-content:not([hidden]) .film-select').length"),0);
  assert.equal(service.files.size,0);
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('#target-size').value"),'10');
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('.export-button').disabled"),true);
  for(const selector of ['#target-size','#width','#height','#scale','#format'])assert.equal(await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();return getComputedStyle(el).outlineStyle;})()`),'none',selector);
  await win.webContents.executeJavaScript("document.querySelector('.add-tile').click()");
  await waitFor(win,"document.querySelectorAll('.module-content:not([hidden]) .film-select').length===1 && document.querySelector('.processed-label')?.textContent.startsWith('处理后')");
  await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#scale');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(win,"document.querySelector('.processed-label')?.textContent==='处理中'");
  assert.equal(await win.webContents.executeJavaScript("!document.querySelector('.compare-image:not(.original-image)')"),true,'pending result must not display the source as a processed image');
  await waitFor(win,"document.querySelector('.preview-info')?.textContent.includes('768 × 512') && document.querySelector('.processed-label')?.textContent.startsWith('处理后')");
  const file=[...service.files.values()][0].item;
  const original=await win.webContents.executeJavaScript("document.querySelector('.original-image').src");
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"查看原图\"]').click()");
  await waitFor(win,"document.querySelector('.processed-label')?.textContent==='原图'");
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('.compare-image').src"),original);
  assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.compare-slider')"),false);
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"查看处理后图片\"]').click()");
  await waitFor(win,"document.querySelector('.processed-label')?.textContent.startsWith('处理后')");
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.compare-image').src !== ${JSON.stringify(original)}`),true);
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"对比原图与结果\"]').click()");
  assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.compare-slider')"),true);
  const drag=await win.webContents.executeJavaScript(`new Promise(resolve=>{
   const preview=document.querySelector('.comparator'),rect=preview.getBoundingClientRect(),overlay=document.querySelector('.drag-comparison');
   for(let n=0;n<48;n++)overlay.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,clientX:rect.left+rect.width*.75}));
   requestAnimationFrame(()=>requestAnimationFrame(()=>resolve((document.querySelector('.split-line').getBoundingClientRect().left-rect.left)/rect.width)));
  })`);
  assert.ok(Math.abs(drag-.75)<.002);
  await win.webContents.executeJavaScript("document.querySelector('#format').click()");
  assert.deepEqual(await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('[role=option]'),el=>el.textContent)"),['自动','JPG','PNG']);
  await win.webContents.executeJavaScript("document.querySelectorAll('[role=option]')[1].click()");
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"解锁宽高比例\"]').click()");
  for(const [selector,value] of [['#width','5000'],['#height','2140']])await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(win,"document.querySelector('.preview-info')?.textContent.includes('5000 × 2140') && document.querySelector('.processed-label')?.textContent.startsWith('处理后')");
  assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.inline-message.error')"),false);
  const sharp=(await import('sharp')).default;
  const point=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.comparator').getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2,width:innerWidth};})()");
  async function sampleLetterbox(){const shot=await win.webContents.capturePage();const ratio=shot.getSize().width/point.width;return (await sharp(shot.toPNG()).extract({left:Math.floor(point.x*ratio),top:Math.floor(point.y*ratio),width:1,height:1}).removeAlpha().raw().toBuffer()).toString('hex');}
  async function paintPreview(){await win.webContents.executeJavaScript("Promise.all(Array.from(document.querySelectorAll('.compare-image'),img=>img.decode())).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");}
  await paintPreview();
  const compareBar=await sampleLetterbox();
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"查看原图\"]').click()");
  await waitFor(win,"document.querySelector('.processed-label')?.textContent==='原图'");
  await paintPreview();
  const originalBar=await sampleLetterbox();
  assert.equal(compareBar,originalBar,'original-side letterboxing must not show the processed image underneath');
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"对比原图与结果\"]').click()");
  await win.webContents.executeJavaScript("document.querySelector('.export-button').click()");
  await waitFor(win,"document.querySelector('.notice')?.textContent.includes('已导出 1 张')");
  const saved=path.join(temp,(await fs.readdir(temp))[0]);
  const meta=await sharp(saved).metadata();
  const result={bytes:(await fs.stat(saved)).size,width:meta.width,height:meta.height,format:meta.format,path:saved};
  assert.ok(result.bytes<=10000000);assert.equal(result.width,5000);assert.equal(result.height,2140);assert.equal(result.format,'jpeg');
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"重置设置\"]').click()");
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('#target-size').value"),'10');
  assert.deepEqual(errors,[]);
  await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
  await fs.writeFile(path.join(__dirname,'../artifacts/native-smoke.json'),JSON.stringify({passed:true,emptyStartup:true,defaultMB:10,originalView:true,dragPosition:drag,fieldsWithoutOuterRing:true,smartByteBudget:true,pendingResultDoesNotUseOriginal:true,originalLetterboxIsolated:true,nativeMacButtons:process.platform==='darwin'?win.getWindowButtonPosition():null,result:{...result,path:'temporary exclusive export'},consoleErrors:errors},null,2));
  console.log(JSON.stringify({passed:true,emptyStartup:true,defaultMB:10,originalView:true,bytes:result.bytes,dimensions:[result.width,result.height],rendererNode:false}));
  win.destroy();app.quit();
 }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);app.exit(1);});
