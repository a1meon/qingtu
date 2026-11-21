const {prepareSmokeWindow}=require('./smoke-window.cjs');
const {app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function createSmoke(prefix,artifactName,{createCanvas=true,exportFolder}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),prefix)),artifact=path.resolve('artifacts',artifactName);await fs.mkdir(artifact,{recursive:true});
 if(exportFolder)await fs.mkdir(exportFolder,{recursive:true});
 const selection=[],context=await start({offscreen:true,hidden:true,projectRoot:path.join(root,'projects'),testFiles:selection,testFolder:exportFolder||artifact}),{win,store,stitching,service}=context;
 win.webContents.setBackgroundThrottling(false);prepareSmokeWindow(win);
 const js=async expression=>{try{return await win.webContents.executeJavaScript(expression);}catch(error){console.error('Renderer expression failed:',expression);throw error;}};
 const wait=async expression=>{for(let n=0;n<600;n++){if(await js(expression))return;await pause(50);}console.error('Timed out UI:',await js('document.body.innerText'));throw new Error('Timed out: '+expression);};
 const ready=async()=>{await js('new Promise(resolve=>{setTimeout(resolve,50);requestAnimationFrame(()=>requestAnimationFrame(resolve));})');await wait("!!document.querySelector('.stitch-output-preview')&&document.querySelector('.save-status').textContent==='已自动保存'&&!document.querySelector('.project-name').disabled");};
 const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const edit=(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const load=async()=>{const name=await js("document.querySelector('.project-name').value");return store.load((await store.list()).find(p=>p.name===name).id);};
 let calls=0;const render=stitching.render.bind(stitching);stitching.render=(...args)=>{calls++;return render(...args);};
 async function drag(selector,dx,dy,shift=false){
  const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {x:(Math.max(r.left,a.left)+Math.min(r.right,a.right))/2,y:(Math.max(r.top,a.top)+Math.min(r.bottom,a.bottom))/2};})()`),before=calls;
  win.webContents.debugger.attach('1.3');try{
   await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1,modifiers:shift?8:0});
   for(let n=1;n<=16;n++)await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*n/16,y:p.y+dy*n/16,buttons:1,modifiers:shift?8:0});
   await wait("document.querySelector('.stitch-canvas').dataset.interacting==='true'");assert.equal(calls,before,'gesture never encodes high-resolution images');
   await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',buttons:0,clickCount:1,modifiers:shift?8:0});
  }finally{win.webContents.debugger.detach();}await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await ready();
 }
 async function importFiles(files){selection.splice(0,selection.length,...files);const count=Number(await js("document.querySelectorAll('.stitch-layer').length"));if(!count)await click('[aria-label="添加画布图片"]');else await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))");await wait(`document.querySelectorAll('.stitch-layer').length===${count+files.length}`);await ready();}
 async function capture(name){await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(artifact,name),(await win.webContents.capturePage()).toPNG());}
 async function save(name){const p=await load(),r=await stitching.render({...p,name}),saved=await service.save(r.token,artifact),buffer=await fs.readFile(saved.path),meta=await (await import('sharp')).default(buffer).metadata();assert.equal(saved.bytes,buffer.length);assert.ok(buffer.length<=p.export.targetBytes);assert.equal(meta.isPalette,false);return {file:saved.path,width:meta.width,height:meta.height,bytes:buffer.length,limit:p.export.targetBytes};}
 async function createBlankCanvas(){
  await click('[aria-label="新建图像"]');
  await wait("document.querySelector('.stitch-create-empty .import-button')?.textContent==='添加图片'&&!document.querySelector('.blank-canvas-button').disabled");
  await click('.blank-canvas-button');
  await wait("document.querySelector('.fixed-empty .import-button')?.disabled===false");
 }
 await wait("!!document.querySelector('[aria-label=\"图像编辑\"]')");await click('[aria-label="图像编辑"]');await wait("!!document.querySelector('[aria-label=\"新建图像\"]')&&!document.querySelector('[aria-label=\"新建图像\"]').disabled");assert.equal((await store.list()).length,0);if(createCanvas){await createBlankCanvas();await wait("!!document.querySelector('[aria-label=\"添加画布图片\"]')");}
 async function finish(report){await fs.writeFile(path.join(artifact,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));win.destroy();app.quit();const absolute=path.resolve(root);if(path.dirname(absolute)!==path.resolve(os.tmpdir())||!path.basename(absolute).startsWith(prefix))throw new Error('Unsafe cleanup');await fs.rm(absolute,{recursive:true,force:true});}
 return {...context,root,artifact,js,wait,ready,click,createBlankCanvas,edit,load,drag,importFiles,capture,save,finish,calls:()=>calls};
}
module.exports={createSmoke};
