// Real production React/CSS in entirely hidden, offscreen desktop fixtures.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();app.setActivationPolicy('accessory');app.on('window-all-closed',()=>{});
const root=path.resolve('artifacts/lite-window');app.setPath('userData',path.join(root,'profile'));
(async()=>{
 await fs.mkdir(root,{recursive:true});await app.whenReady();const cases=[];
 for(const platform of ['win32','darwin']) {
  const preload=path.join(root,`preload-${platform}.cjs`);
  await fs.writeFile(preload,`window.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add('lite-desktop',${JSON.stringify(platform==='darwin'?'lite-mac':'lite-win')}));window.actions=[];window.resizeCalls=[];window.titlebarBound=false;window.qingtu={platform:${JSON.stringify(platform)},windowChrome:${JSON.stringify(platform==='win32'?'custom-win':'native-mac')},beginWindowResize:async edge=>window.resizeCalls.push(edge),bindTitlebar:async element=>{window.titlebarBound=!!element;return()=>{};},onFlush:()=>()=>{},onMenu:()=>()=>{},onUpdate:()=>()=>{},samples:async()=>[],stitchList:async()=>[],stitchPreviews:async()=>[],updateStatus:async()=>({version:'0.5.3',phase:'idle',visible:false}),windowAction:async a=>window.actions.push(a)};`);
  const win=new BrowserWindow({show:false,opacity:0,x:32000,y:32000,width:1280,height:820,transparent:platform==='darwin',backgroundColor:platform==='darwin'?'#00000000':'#ffffff',webPreferences:{preload,contextIsolation:false,nodeIntegration:false,offscreen:true}});
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
  const expected=platform==='win32'?['最小化','最大化或还原','关闭窗口']:[];
  if(platform==='darwin'){
   assert.equal(await js("getComputedStyle(document.querySelector('.app')).borderTopLeftRadius"),'12px','Mac page corners must be rounded');
   for(const selector of ['html','body','#root'])assert.equal(await js(`getComputedStyle(document.querySelector('${selector}')).backgroundColor`),'rgba(0, 0, 0, 0)','Mac host backing must be transparent');
   await js("document.documentElement.classList.add('lite-mac-maximized')");
   assert.equal(await js("getComputedStyle(document.querySelector('.app')).borderTopLeftRadius"),'0px');
   await js("document.documentElement.classList.remove('lite-mac-maximized')");
  }
  assert.deepEqual(buttons,expected,'exactly one set of integrated window controls');
  for(const label of buttons)await js(`document.querySelector('[aria-label="${label}"]').click()`);
  assert.deepEqual(await js('window.actions'),platform==='win32'?['minimize','maximize','close']:[]);assert.equal(await js('window.titlebarBound'),true);
  if(platform==='win32'){
   assert.equal(await js("getComputedStyle(document.querySelector('.app')).borderTopLeftRadius"),'12px');
   for(const edge of ['n','s','e','w','nw','ne','sw','se'])await js(`document.querySelector('[data-window-edge="${edge}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true}))`);
   assert.deepEqual(await js('window.resizeCalls'),['n','s','e','w','nw','ne','sw','se']);
   await js("document.documentElement.classList.add('lite-win-maximized')");
   assert.equal(await js("getComputedStyle(document.querySelector('.app')).borderTopLeftRadius"),'0px');
   assert.equal(await js("getComputedStyle(document.querySelector('.window-resize-edges')).display"),'none');
   await js("document.documentElement.classList.remove('lite-win-maximized')");
   assert.equal(await js("getComputedStyle(document.querySelector('.app')).borderTopLeftRadius"),'12px');
  }
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false});await js('new Promise(r=>setTimeout(r,250))');console.log('Verified '+platform+' layout/controls');const capture=(await win.webContents.capturePage().catch(e=>{throw new Error('Capture '+platform+': '+e.message);})).toPNG();await fs.writeFile(path.join(root,platform+'.png'),capture);
  if(platform==='darwin'){
   const checkAlpha=async(bytes,label)=>{const {data,info}=await require('sharp')(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(const [x,y]of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(data[(y*info.width+x)*4+3],0,label);assert.equal(data[(30*info.width+30)*4+3],255,'main window content stays opaque');};
   await checkAlpha(capture,'rounded corner pixel must be transparent');
   await js("(()=>{const p=document.createElement('div');p.id='corner-portal-fixture';p.style.cssText='position:fixed;left:0;top:0;width:40px;height:40px;background:blue;z-index:999999';document.body.append(p)})()");await js('new Promise(r=>setTimeout(r,100))');await checkAlpha((await win.webContents.capturePage()).toPNG(),'floating panels must not paint outside window corners');await js("document.getElementById('corner-portal-fixture').remove()");
   for(const kind of ['update-dialog','stitch-dialog']){
    await js(`(()=>{let d=document.querySelector('dialog.${kind}');if(!d){d=document.createElement('dialog');d.className='${kind}';d.id='corner-dialog-fixture';d.textContent='圆角测试';document.body.append(d);}d.showModal()})()`);await js('new Promise(r=>setTimeout(r,150))');
    await checkAlpha((await win.webContents.capturePage()).toPNG(),kind+' backdrop must preserve transparent window corners');
    await js("(()=>{const d=document.querySelector('dialog[open]');d.close();if(d.id==='corner-dialog-fixture')d.remove()})()");
   }
  }
  win.webContents.debugger.detach();win.destroy();
 }
 const report={passed:true,hiddenOffscreen:true,cases,windowsIntegratedControls:true,windowsResizeEdges:8,windowsRoundPage:true,macNativeControls:true,macTransparentCorners:true,nativeWindowsExecuted:false};await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
