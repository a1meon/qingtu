// Real React update dialog + bundled Neutralino SDK, with no visible windows.
// Windows native move/installer execution is recorded at the RPC boundary.
const {prepareSmokeWindow}=require('./smoke-window.cjs');
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.on('window-all-closed',()=>{});
const timeout=setTimeout(()=>{console.error('Update click smoke timed out');app.exit(1);},20000);
(async()=>{
 await app.whenReady();
 const dir=path.resolve('artifacts/update-click');await fs.mkdir(dir,{recursive:true});
 const manifest=JSON.parse(await fs.readFile('tests/fixtures/lite-signed-windows-0.5.3.json','utf8'));
 const entry=`
 import React from 'react';import{createRoot}from'react-dom/client';
 import * as N from '@neutralinojs/lib';
 import{initializeUpdater}from'./src/lite/updater.mjs';
 import{bindTitlebar}from'./src/lite/window-shell.mjs';
 window.nativeCalls=[];window.operations=[];
 window.WebSocket=class extends EventTarget{static OPEN=1;readyState=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(raw){const m=JSON.parse(raw);window.nativeCalls.push(m.method);if(m.method==='os.open')window.operations.push('open');queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:m.id,data:{success:true,returnValue:true}})})));}};
 window.NL_TOKEN='smoke.token';window.NL_PORT=1;window.NL_GINJECTED=true;window.NL_ARGS=['--qingtu-smoke'];
 const ready=new Promise(r=>N.events.on('ready',r));N.init();await ready;
 const listeners=new Set();window.downloads=0;
 const ctx={api:{platform:'win32',onUpdate:f=>(listeners.add(f),()=>listeners.delete(f))},
  native:async(method,url)=>{if(method==='download'){window.downloads++;return 'C:/smoke/verified.exe';}return url.includes('/api/')?JSON.stringify([{tag_name:'v0.5.3'}]):JSON.stringify(${JSON.stringify(manifest)});},
  N,info:{arch:'amd64'},flush:async()=>{window.operations.push('flush');},close:async()=>{window.operations.push('close');window.fixtureClosed=true;},setState:s=>{window.updateState=s;for(const f of listeners)f(s);}};
 initializeUpdater(ctx,'0.5.2');window.qingtu=ctx.api;
 const{AppUpdates}=await import('./src/AppUpdates.jsx');
 createRoot(document.getElementById('root')).render(<header className="titlebar"><span>轻图</span><AppUpdates busy={false} hasImages={false}/></header>);
 while(!document.querySelector('.version-button'))await new Promise(r=>setTimeout(r,10));
 if(${!!process.env.QINGTU_UPDATE_DRAG_BASELINE})await N.window.setDraggableRegion(document.querySelector('.titlebar'),{exclude:[...document.querySelectorAll('.titlebar button')]});
 else await bindTitlebar(N,document.querySelector('.titlebar'),'win32');
 window.fixtureReady=true;
 `;
 const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'esm',platform:'browser',write:false,jsx:'automatic'});
 await fs.writeFile(path.join(dir,'fixture.mjs'),bundle.outputFiles[0].contents);
 await fs.writeFile(path.join(dir,'fixture.html'),'<!doctype html><html><body><div id="root"></div><script type="module" src="./fixture.mjs"></script></body></html>');
 const win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{backgroundThrottling:false}});prepareSmokeWindow(win);
 const js=x=>win.webContents.executeJavaScript(x);
 const wait=async expression=>{for(let i=0;i<150;i++){if(await js(expression))return;await pause(20);}throw Error('Timed out: '+expression);};
 try{
  await win.loadFile(path.join(dir,'fixture.html'));await wait('window.fixtureReady===true');
  await js('document.querySelector(".version-button").click()');
  await wait('document.querySelector("dialog").open&&window.updateState?.phase==="available"');
  // These actions are rendered after drag binding, unlike the header buttons.
  const button=await js('(()=>{const r=document.querySelector(".update-actions .primary").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:document.querySelector(".update-actions .primary").textContent}})()');
  assert.equal(button.label,'立即更新');
  win.webContents.sendInputEvent({type:'mouseMove',x:button.x,y:button.y});
  win.webContents.sendInputEvent({type:'mouseDown',x:button.x,y:button.y,button:'left',clickCount:1});
  await pause(80);
  win.webContents.sendInputEvent({type:'mouseUp',x:button.x,y:button.y,button:'left',clickCount:1});
  await wait('window.downloads===1');
  const dragCalls=await js('window.nativeCalls.filter(m=>m==="window.beginDrag").length');
  const report={hiddenOffscreen:true,baseline052:!!process.env.QINGTU_UPDATE_DRAG_BASELINE,dragCalls,downloads:await js('window.downloads'),phase:await js('window.updateState.phase'),installerExecuted:false,windowsNativeExecuted:false};
  if(report.baseline052)await fs.writeFile(path.join(dir,'baseline-0.5.2.json'),JSON.stringify(report,null,2));
  if(report.baseline052)console.log(JSON.stringify(report));
  assert.equal(dragCalls,0,'update button must never enter the native window-move loop');
  assert.equal(report.phase,'ready');
  if(!report.baseline052){
   const install=await js('(()=>{const r=document.querySelector(".update-actions .primary").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
   win.webContents.sendInputEvent({type:'mouseDown',...install,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...install,button:'left',clickCount:1});
   await wait('window.fixtureClosed===true');assert.deepEqual(await js('window.operations'),['flush','open','close']);
   assert.equal(await js('window.nativeCalls.filter(m=>m==="os.open").length'),1,'verified installer is opened once after saves');
   assert.equal(await js('window.nativeCalls.includes("window.beginDrag")'),false,'install action must not drag either');
   report.installOpenRequested=true;report.closeRequestedAfterFlush=true;
  }
  await fs.writeFile(path.join(dir,'current.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{win.destroy();}
 clearTimeout(timeout);app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
