const {app,dialog,shell}=require('electron');
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
  const pictures=path.join(temp,'用户指定的图片库'),defaultFolder=path.join(pictures,'轻图output');
  await fs.mkdir(pictures);app.setPath('pictures',pictures);
  let nextFolder=null,chooserCalls=0;
  dialog.showOpenDialog=async()=>{
   chooserCalls++;
   return nextFolder?{canceled:false,filePaths:[nextFolder]}:{canceled:true,filePaths:[]};
  };
  const {win,service}=await start({offscreen:true,projectRoot:path.join(temp,'projects'),testFiles:[path.join(__dirname,'../public/samples/alpine-lake.jpg')],hidden:true});
  win.webContents.setBackgroundThrottling(false);
  const errors=[],opened=[];
  shell.openPath=async folder=>{opened.push(folder);return '';};
  const js=expression=>win.webContents.executeJavaScript(expression);
  async function checkOpen(selector,expected){
   await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
   for(let n=0;n<100&&!opened.length;n++)await pause(20);
   assert.equal(opened.shift(),expected);
  }
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  await waitFor(win,"!!document.querySelector('.export-button') && !document.querySelector('.add-tile').disabled");
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"压缩调整\"]').click()");
  if(process.platform==='darwin'){
   assert.deepEqual(win.getWindowButtonPosition(),{x:14,y:18});
   assert.equal(await win.webContents.executeJavaScript("document.querySelector('.brand').getBoundingClientRect().left >= 90 && !document.querySelector('.mac-controls')"),true);
  }
  assert.equal(await win.webContents.executeJavaScript("typeof window.require"),'undefined');
  assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.module-content:not([hidden]) .film-select').length"),0);
  assert.equal(service.files.size,0);
  assert.equal(await js("document.querySelectorAll('input.folder-control[readonly]').length"),2);
  await waitFor(win,"Array.from(document.querySelectorAll('.folder-picker')).every(button=>button.textContent==='选择目录'&&!button.disabled)");
  const active='.module-content:not([hidden]) ';
  const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await waitFor(win,`Array.from(document.querySelectorAll('.folder-control')).every(field=>field.value===${JSON.stringify(defaultFolder)})`);
  assert.deepEqual(await fs.readdir(pictures),[],'displaying the default does not create it');
  assert.equal(await js("getComputedStyle(document.querySelector('.folder-picker')).backgroundColor"),'rgb(255, 255, 255)');
  assert.equal(await js(`(()=>{
   const field=document.querySelector('.folder-control').getBoundingClientRect();
   const button=document.querySelector('.folder-picker'),bounds=button.getBoundingClientRect();
   return bounds.top===field.top&&bounds.bottom===field.bottom&&getComputedStyle(button).boxShadow.includes('inset');
  })()`),true,'the raised button edge fits inside the same top and bottom bounds as the path field');
  assert.deepEqual(await js(`['.folder-control','#target-size'].map(selector=>{
   const style=getComputedStyle(document.querySelector(selector));
   return [style.backgroundColor,style.borderBottomWidth];
  })`),Array(2).fill(['rgb(245, 249, 252)','4px']));
  win.webContents.debugger.attach('1.3');
  try{
   await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
   await js("document.querySelector('.folder-control').focus()");
   await waitFor(win,"getComputedStyle(document.querySelector('.folder-control')).borderTopColor==='rgb(28, 176, 246)'");
   await js("document.querySelector('.folder-control').blur()");
  }finally{win.webContents.debugger.detach();}
  async function showHistory(count){
   await click(active+'.history-trigger');
   await waitFor(win,`!!document.querySelector('.export-history-dialog[open]')&&document.querySelector('.history-heading p')?.textContent.includes('${count} 条记录')`);
  }
  const closeHistory=()=>click('[aria-label="关闭导出历史"]');
  await showHistory(0);await closeHistory();
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('#target-size').value"),'10');
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('.export-button').disabled"),true);
  for(const selector of ['#target-size','#width','#height','#scale','#format'])assert.equal(await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();return getComputedStyle(el).outlineStyle;})()`),'none',selector);
  await win.webContents.executeJavaScript("document.querySelector('.add-tile').click()");
  await waitFor(win,"document.querySelectorAll('.module-content:not([hidden]) .film-select').length===1 && document.querySelector('.processed-label')?.textContent.startsWith('处理后')");
  await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('#scale');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(win,"document.querySelector('.processed-label')?.textContent==='处理中'");
  assert.equal(await win.webContents.executeJavaScript("!document.querySelector('.processed-image')&&!!document.querySelector('.preview-loading-source')&&!!document.querySelector('.preview-loading-spinner .spin')"),true,'pending processing uses a clearly distinguished dimmed source and spinner, without claiming an actual result');
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
  assert.deepEqual(await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('[role=option]'),el=>el.textContent)"),['JPG','PNG']);
  await win.webContents.executeJavaScript("document.querySelectorAll('[role=option]')[0].click()");
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
  assert.equal(chooserCalls,0,'first compression export uses the displayed default directly');
  const saved=path.join(defaultFolder,(await fs.readdir(defaultFolder))[0]);
  const meta=await sharp(saved).metadata();
  const result={bytes:(await fs.stat(saved)).size,width:meta.width,height:meta.height,format:meta.format,path:saved};
  assert.ok(result.bytes<=10000000);assert.equal(result.width,5000);assert.equal(result.height,2140);assert.equal(result.format,'jpeg');
  await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"重置设置\"]').click()");
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('#target-size').value"),'10');
  const noticeButton='.notice button:not(.icon-button)';
  await checkOpen(noticeButton,defaultFolder);
  await showHistory(1);await checkOpen('.history-open',defaultFolder);await closeHistory();
  await click(active+'.folder-picker');
  for(let n=0;n<100&&!chooserCalls;n++)await pause(20);
  assert.equal(chooserCalls,1);
  assert.equal(await js("document.querySelector('.folder-control').value"),defaultFolder,'cancelling retains the default');
  const other=path.join(temp,'Extra-long-output-directory-'.repeat(5));await fs.mkdir(other);nextFolder=other;
  await click(active+'.folder-picker');await waitFor(win,`document.querySelector('.folder-control').value===${JSON.stringify(other)}`);
  const detail=await js(`(()=>{const field=document.querySelector('.folder-control');field.focus();const tip=document.querySelector('.folder-full-path');return {path:tip.textContent,name:tip.querySelector('strong').textContent,wrapped:tip.clientHeight>field.clientHeight,widthFits:tip.scrollWidth===tip.clientWidth};})()`);
  assert.deepEqual(detail,{path:other,name:path.basename(other),wrapped:true,widthFits:true});
  await click(active+'.export-button');await waitFor(win,"!document.querySelector('.export-button').disabled&&document.querySelector('.notice')?.textContent.includes('已导出 1 张')");
  await showHistory(2);
  await checkOpen('.history-list li:nth-child(1) button',other);
  await checkOpen('.history-list li:nth-child(2) button',defaultFolder);
  await fs.unlink(saved);
  await click('.history-list li:nth-child(2) button');
  await waitFor(win,"document.querySelector('.history-list li:nth-child(2) button').disabled&&document.querySelector('.history-unavailable')?.textContent.includes('已删除或移动')");
  assert.deepEqual(opened,[],'deleting the image alone disables its historical folder action');
  await closeHistory();
  nextFolder=path.join(temp,'missing-destination');await click(active+'.folder-picker');
  await waitFor(win,"document.querySelector('.folder-control').value.endsWith('missing-destination')");
  await click(active+'.export-button');await waitFor(win,"document.querySelector('.notice.error')?.textContent.includes('已导出 0 张')");
  await showHistory(2);await closeHistory();
  await click('[aria-label=图像编辑]');await showHistory(0);await closeHistory();
  const beforeCanvas=chooserCalls;await click('.stitch-create-empty .import-button');
  await waitFor(win,"document.querySelectorAll('.stitch-layer').length===1 && !document.querySelector('.module-content:not([hidden]) .export-button').disabled");
  await click(active+'.export-button');await waitFor(win,"document.querySelector('.notice')?.textContent.includes('已导出 1 张图像')");
  assert.equal(chooserCalls,beforeCanvas,'first canvas export uses its own default directly');
  await checkOpen(noticeButton,defaultFolder);await showHistory(1);await checkOpen('.history-open',defaultFolder);await closeHistory();
  const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.webContents.reload();await loaded;await waitFor(win,"!!document.querySelector('.module-content:not([hidden]) .history-trigger:enabled')");
  await fs.rename(defaultFolder,path.join(temp,'moved-canvas'));
  await showHistory(1);assert.equal(await js("document.querySelector('.history-open').disabled"),true);
  await closeHistory();await click('[aria-label=压缩调整]');await showHistory(2);await checkOpen('.history-open',other);await closeHistory();
  assert.deepEqual(errors,[]);
  await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
  await fs.writeFile(path.join(__dirname,'../artifacts/native-smoke.json'),JSON.stringify({passed:true,emptyStartup:true,defaultMB:10,originalView:true,dragPosition:drag,fieldsWithoutOuterRing:true,smartByteBudget:true,pendingShowsDimmedOriginal:true,pendingDoesNotClaimActualResult:true,originalLetterboxIsolated:true,nativeMacButtons:process.platform==='darwin'?win.getWindowButtonPosition():null,result:{...result,path:'temporary exclusive export'},consoleErrors:errors},null,2));
  console.log(JSON.stringify({passed:true,emptyStartup:true,defaultMB:10,originalView:true,bytes:result.bytes,dimensions:[result.width,result.height],rendererNode:false}));
  win.destroy();app.quit();
 }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);app.exit(1);});
