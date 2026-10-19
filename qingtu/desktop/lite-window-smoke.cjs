// Real production React/CSS in entirely hidden, offscreen desktop fixtures.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setActivationPolicy('accessory');app.on('window-all-closed',()=>{});
const root=path.resolve('artifacts/lite-window');app.setPath('userData',path.join(root,'profile'));
(async()=>{
 await fs.mkdir(root,{recursive:true});await app.whenReady();const cases=[];
 for(const platform of ['win32','darwin']) {
  const preload=path.join(root,`preload-${platform}.cjs`);
  await fs.writeFile(preload,`window.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add('lite-desktop',${JSON.stringify(platform==='darwin'?'lite-mac':'lite-windows')}));window.actions=[];window.titlebarBound=false;window.qingtu={platform:${JSON.stringify(platform)},windowChrome:${JSON.stringify(platform==='win32'?'native':'custom-mac')},bindTitlebar:async element=>{window.titlebarBound=!!element;return()=>{};},onFlush:()=>()=>{},onMenu:()=>()=>{},onUpdate:()=>()=>{},samples:async()=>[],stitchList:async()=>[],stitchPreviews:async()=>[],updateStatus:async()=>({version:'0.5.3',phase:'idle',visible:false}),windowAction:async a=>window.actions.push(a)};`);
  const win=new BrowserWindow({show:false,opacity:0,x:32000,y:32000,width:1280,height:820,webPreferences:{preload,contextIsolation:false,nodeIntegration:false,offscreen:true}});
  assert.ok(!win.isVisible()&&!win.isFocused()&&win.webContents.isOffscreen());
  await win.loadFile(path.resolve('dist/client/index.html'));
  const js=code=>win.webContents.executeJavaScript(code);for(let n=0;n<100;n++){if(await js("!!document.querySelector('.app')"))break;await new Promise(r=>setTimeout(r,50));}
  win.webContents.debugger.attach('1.3');
  for(const [width,height,dpr]of [[1280,820,1],[1093,550,1.25],[910,470,1.5],[640,420,2]]) {
   await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
   await js('new Promise(r=>setTimeout(r,350))');
   for(const module of ['图像编辑','压缩调整']) {
    await js(`document.querySelector('[aria-label="${module}"]').click()`);await js('new Promise(r=>setTimeout(r,50))');
    const geometry=await js(`(()=>{const a=document.querySelector('.app').getBoundingClientRect(),b=document.querySelector('.workspace').getBoundingClientRect(),f=document.querySelector('.module-content:not([hidden]) .filmstrip')?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},app:a.toJSON(),workspace:b.toJSON(),filmstrip:f?.toJSON(),scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth}})()`);
    assert.ok(geometry.app.bottom<=height+1,`${platform} ${module} app exceeds client height: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.workspace.bottom<=height+1,'workspace stays inside client area');
    assert.ok(geometry.scrollHeight<=height+1&&geometry.scrollWidth<=width+1,'no page-level scrolling');
    if(geometry.filmstrip)assert.ok(geometry.filmstrip.bottom<=height+1,'bottom image strip remains visible');
    cases.push({platform,width,height,dpr,module,appHeight:geometry.app.height,pageScroll:false});
   }
  }
  const buttons=await js("[...document.querySelectorAll('.window-controls button,.mac-window-controls button')].map(e=>e.getAttribute('aria-label'))");
  if(platform==='win32')assert.deepEqual(buttons,[],'native Windows frame owns window controls');
  else {
   assert.deepEqual(buttons,['关闭窗口','最小化','最大化或还原']);
   for(const label of buttons)await js(`document.querySelector('[aria-label="${label}"]').click()`);
   assert.deepEqual(await js('window.actions'),['close','minimize','maximize']);assert.equal(await js('window.titlebarBound'),true);
  }
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false});await js('new Promise(r=>setTimeout(r,250))');console.log('Verified '+platform+' layout/controls');await fs.writeFile(path.join(root,platform+'.png'),(await win.webContents.capturePage().catch(e=>{throw new Error('Capture '+platform+': '+e.message);})).toPNG());win.webContents.debugger.detach();win.destroy();
 }
 const report={passed:true,hiddenOffscreen:true,cases,windowsNativeFramePolicy:true,macCustomControls:true,nativeWindowsExecuted:false};await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
