const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=process.env.QINGTU_OPTIMIZATION_ROOT;if(!root)throw new Error('Missing isolated optimization root');
 const mode=process.env.QINGTU_OPTIMIZATION_MODE||'optimize',exports=path.join(root,'exports');await fs.mkdir(exports,{recursive:true});
 const {win,store,stitching}=await start({hidden:true,testFolder:exports,projectRoot:path.join(root,'projects'),testFiles:[path.join(root,'source.png')],onCloseError:error=>{console.error(error);app.exit(1);}});
 win.webContents.setBackgroundThrottling(false);
 const js=expression=>win.webContents.executeJavaScript(expression);
 async function waitFor(expression){for(let n=0;n<200;n++){if(await js(expression))return;await pause(100);}throw new Error('Timed out: '+expression);}
 await waitFor("!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");
 if(mode!=='optimize'){
  await waitFor("document.querySelectorAll('.stitch-layer').length===2 && document.querySelector('.stitch-info').textContent.includes(' MB') && !document.querySelector('.project-name').disabled");
  let started=false,finished=false,calls=0;
  if(mode==='export'){
   const render=stitching.render.bind(stitching);stitching.render=async(...args)=>{if(args[1]?.latest)return render(...args);started=true;calls++;await pause(1000);const result=await render(...args);finished=true;return result;};
   await js("document.querySelector('.module-content:not([hidden]) .export-button').click()");
  }else{
   const importSource=store.import.bind(store);store.import=async(...args)=>{started=true;calls++;await pause(1000);const result=await importSource(...args);finished=true;return result;};
   await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))");
  }
  for(let n=0;n<100&&!started;n++)await pause(10);assert.ok(started);assert.equal(finished,false);
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${mode==='export'?'s':'o'}',ctrlKey:true,shiftKey:${mode==='export'},bubbles:true}))`);
  win.once('closed',()=>{if(!finished||calls!==1){console.error('Busy retry lost the original '+mode+' operation');app.exit(1);}});
  await js("window.qingtu.windowAction('close')");return;
 }
 await waitFor("!document.querySelector('[aria-label=\"添加拼接图片\"]').disabled");
 await js("(()=>{const el=document.querySelector('#stitch-long-edge');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1200');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");await waitFor("document.querySelectorAll('.stitch-layer').length===1 && document.querySelector('.save-status').textContent==='已自动保存'");
 await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))");await waitFor("document.querySelectorAll('.stitch-layer').length===2 && document.querySelector('.save-status').textContent==='已自动保存'");
 let started=false,finished=false;
 const render=stitching.render.bind(stitching);stitching.render=async(...args)=>{started=true;await pause(1000);const result=await render(...args);finished=true;await fs.writeFile(path.join(root,'result.json'),JSON.stringify({width:result.width,height:result.height,bytes:result.bytes,closeWaitedForActualPreview:true}));return result;};
 await js("document.querySelector('[aria-label=\"一键优化\"]').click()");await waitFor("document.querySelector('.stitch-dialog h2')?.textContent==='生成预览'");
 assert.ok(started);assert.equal(finished,false);const project=await store.load((await store.list())[0].id);assert.ok(project.images.every(image=>project.edits[image.id].fraction>0));
 win.once('closed',()=>{if(!finished){console.error('Window closed before optimization finished');app.exit(1);}});
 await js("window.qingtu.windowAction('close')");
})().catch(error=>{console.error(error);app.exit(1);});
