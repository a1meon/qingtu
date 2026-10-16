const {app}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const mode=process.env.QINGTU_CLOSE_MODE||'thumbnail',root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-close-')),traces=[],closeErrors=[];
 const {win,store}=await start({hidden:false,projectRoot:path.join(root,'projects'),testFiles:[path.resolve('public/samples/alpine-lake.jpg')],onCloseTrace:step=>{traces.push(step);console.log(step)},onCloseError:error=>{if(mode==='save-error')closeErrors.push(error);else{console.error(error);app.exit(1)}}});
 win.webContents.setBackgroundThrottling(false);win.show();win.focus();
 const js=x=>win.webContents.executeJavaScript(x),wait=async x=>{for(let n=0;n<200;n++){if(await js(x))return;await pause(50)}throw Error('Timed out: '+x)};
 const timer=setTimeout(async()=>{console.error(JSON.stringify({failure:'Native close did not complete',traces,ui:await js("({save:document.querySelector('.save-status')?.textContent,images:document.querySelectorAll('.stitch-layer').length})").catch(()=>null)}));app.exit(1)},mode==='traffic-light'?60000:20000);
 await wait("!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");
 await wait("!!document.querySelector('[aria-label=\"新建画布\"]')&&!document.querySelector('[aria-label=\"新建画布\"]').disabled");
 await js("document.querySelector('[aria-label=\"新建画布\"]').click()");await wait("!!document.querySelector('[aria-label=\"添加拼接图片\"]')&&document.querySelector('.save-status').textContent==='已自动保存'");
 if(mode!=='empty'){
  await js("(()=>{for(const [id,value] of [['stitch-width',240],['stitch-height',120]]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
  // Reproduce the Chromium failure already observed in native smoke runs:
  // loaded, drawable image bytes with a decode() promise that never settles.
  if(mode==='thumbnail')await js("void (HTMLImageElement.prototype.decode=function(){return new Promise(()=>{})})");
  await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");await wait("document.querySelectorAll('.stitch-layer').length===1");
  await wait("[...document.querySelectorAll('.stitch-layer img')].every(i=>i.complete&&i.naturalWidth>0)");
  if(mode==='optimization'){await wait("document.querySelector('.save-status').textContent==='已自动保存'&&!!document.querySelector('.stitch-output-preview')&&!document.querySelector('.project-name').disabled");await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))");await wait("document.querySelectorAll('.stitch-layer').length===2");await wait("document.querySelector('.save-status').textContent==='已自动保存'&&!!document.querySelector('.stitch-output-preview')");await js("void (HTMLImageElement.prototype.decode=function(){return new Promise(()=>{})})");await js("document.querySelector('[aria-label=\"一键优化\"]').click()");await wait("!!document.querySelector('.optimization-progress')");}
 }
 if(mode==='save-error'){
  await wait("document.querySelector('.save-status').textContent==='已自动保存'&&!!document.querySelector('.stitch-output-preview')&&!document.querySelector('.project-name').disabled");
  const save=store.save.bind(store);store.save=async()=>{throw Error('Isolated save failure')};
  await js("(()=>{const e=document.querySelector('.project-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'关闭失败恢复测试');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("document.querySelector('.save-status').textContent==='未保存'");win.close();for(let n=0;n<100&&!closeErrors.length;n++)await pause(50);assert.equal(closeErrors.length,1);assert.equal(win.isDestroyed(),false,'unsaved work must keep its window');store.save=save;await js("document.querySelector('.inline-message.error button').click()");await wait("document.querySelector('.save-status').textContent==='已自动保存'");
 }
 const closed=new Promise(resolve=>win.once('closed',resolve));if(mode==='traffic-light'){win.setTitle('轻图关闭验证');console.log('READY_FOR_NATIVE_CLOSE');}else win.close();await closed;clearTimeout(timer);
 const list=await store.list(),project=await store.load(list[0].id);assert.equal(project.images.length,mode==='empty'?0:mode==='optimization'?2:1);
 if(mode!=='empty'){assert.ok((await store.readAsset(project.images[0].assetId)).equals(await fs.readFile(path.resolve('public/samples/alpine-lake.jpg'))));assert.ok(project.thumbnail?.startsWith('data:image/png;base64,'));}
 assert.deepEqual(traces,mode==='save-error'?['waiting renderer','waiting renderer','renderer flushed','closing']:['waiting renderer','renderer flushed','closing']);
 const report={passed:true,mode,nativeWindowClose:true,projectAndOriginalSaved:true,saveFailureBlocksClose:mode==='save-error',traces};await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/window-close-'+mode+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await fs.rm(root,{recursive:true,force:true});app.quit();
})().catch(e=>{console.error(e);app.exit(1)});
