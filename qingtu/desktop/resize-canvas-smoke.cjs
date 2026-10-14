const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win,expression){
 for(let n=0;n<600;n++){if(await win.webContents.executeJavaScript(expression))return;await pause(50);}
 throw new Error('Timed out: '+expression);
}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-resize-canvas-'));
 try{
  const artifact=path.resolve('artifacts/resize-canvas');await fs.mkdir(artifact,{recursive:true});
  const source=path.resolve('artifacts/stitch-fixtures/01-alpine.jpg');
  const {win,store,stitching,service}=await start({hidden:true,projectRoot:path.join(root,'projects'),testFiles:[source],testFolder:artifact});
  win.webContents.setBackgroundThrottling(false);win.show();win.focus();
  const js=expression=>win.webContents.executeJavaScript(expression);
  const load=async()=>store.load((await store.list())[0].id);
  const edit=(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const ready=()=>waitFor(win,"!!document.querySelector('.stitch-output-preview') && document.querySelector('.save-status').textContent==='已自动保存' && !document.querySelector('.project-name').disabled");
  const capture=async name=>{await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await fs.writeFile(path.join(artifact,name),(await win.webContents.capturePage()).toPNG());};
  let calls=0;const render=stitching.render.bind(stitching);stitching.render=(...args)=>{calls++;return render(...args);};
  async function pointer(selector,dx,dy){
   const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),before=calls;
   win.webContents.debugger.attach('1.3');
   try{
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    for(let n=1;n<=12;n++)await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*n/12,y:point.y+dy*n/12,buttons:1});
    await waitFor(win,"document.querySelector('.stitch-canvas').dataset.interacting==='true'");assert.equal(calls,before,'no encoding during the gesture');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',buttons:0,clickCount:1});
   }finally{win.webContents.debugger.detach();}
   await ready();
  }
  async function resize(width,height){
   await js("document.querySelector('.stitch-layer').focus()");await waitFor(win,"!!document.querySelector('[data-handle=se]')");
   const p=await load(),pose=p.positions[p.images[0].id],scale=await js("Number(document.querySelector('.stitch-canvas').style.width.replace('px',''))/Number(document.querySelector('#stitch-width').value)");
   await pointer('[data-handle=se]',(width-pose.width)*scale,(height-pose.height)*scale);
   const next=await load(),actual=next.positions[next.images[0].id];assert.ok(Math.abs(actual.width-width)<.01,JSON.stringify({expected:width,actual:actual.width}));assert.ok(Math.abs(actual.height-height)<.01,JSON.stringify({expected:height,actual:actual.height}));return next;
  }
  await waitFor(win,"!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");
  await waitFor(win,"!!document.querySelector('[aria-label=\"新建画布\"]')&&!document.querySelector('[aria-label=\"新建画布\"]').disabled");await js("document.querySelector('[aria-label=\"新建画布\"]').click()");
  await waitFor(win,"!!document.querySelector('[aria-label=\"添加拼接图片\"]')");await edit('#stitch-width',600);await edit('#stitch-height',240);await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");await ready();
  const initial=await load();assert.deepEqual(initial.canvas,{width:450,height:600});assert.equal(initial.canvasSizing,'content');
  const enlarged=await resize(600,800);assert.deepEqual(enlarged.canvas,{width:600,height:800});await capture('enlarged.png');
  const shrunk=await resize(300,400);assert.deepEqual(shrunk.canvas,{width:300,height:400});await capture('shrunk.png');
  const output=await stitching.render({...shrunk,name:'resize-fit'}),saved=await service.save(output.token,artifact),bytes=await fs.readFile(saved.path),sharp=(await import('sharp')).default;
  const meta=await sharp(bytes).metadata(),raw=await sharp(bytes).ensureAlpha().raw().toBuffer();assert.deepEqual([meta.width,meta.height],[300,400]);assert.equal(saved.bytes,bytes.length);assert.ok(bytes.length<=10000000);assert.equal(meta.isPalette,false);for(let n=3;n<raw.length;n+=4)assert.equal(raw[n],255,'no stale transparent outer area');
  await fs.writeFile(path.join(artifact,'project.json'),JSON.stringify(shrunk));
  await pointer('.stitch-layer',-35,-20);const moved=await load();assert.deepEqual(moved.canvas,shrunk.canvas);assert.ok(moved.positions[moved.images[0].id].x<0);await capture('moved-outside.png');
  await js("document.querySelector('[data-layout=vertical]').click()");await ready();await js("document.querySelector('[data-layout=horizontal]').click()");await ready();assert.deepEqual((await load()).canvas,moved.canvas);assert.deepEqual((await load()).positions,moved.positions);
  await win.webContents.reload();await waitFor(win,"!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");await ready();assert.deepEqual((await load()).canvas,moved.canvas);assert.deepEqual((await load()).positions,moved.positions);
  await js("document.querySelector('[aria-label=\"画布预设\"]').click()");await waitFor(win,"!!document.querySelector('[role=option]')");await js("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.trim()==='16:9').click()");await ready();const preset=await load();assert.deepEqual(preset.canvas,{width:5984,height:3366});assert.equal(preset.canvasSizing,'manual');
  const presetResized=await resize(150,200);assert.deepEqual(presetResized.canvas,preset.canvas);
  await edit('#stitch-width',800);await edit('#stitch-height',400);await ready();const manual=await resize(90,120);assert.deepEqual(manual.canvas,{width:800,height:400});await capture('manual-frame.png');
  assert.ok((await store.readAsset(initial.images[0].assetId)).equals(await fs.readFile(source)));assert.deepEqual(manual.edits,initial.edits);assert.deepEqual(manual.initialOrder,initial.initialOrder);
  const report={passed:true,initialCanvas:initial.canvas,enlargedCanvas:enlarged.canvas,shrunkCanvas:shrunk.canvas,presetCanvas:preset.canvas,manualCanvas:manual.canvas,autoGrowAndShrink:true,noNormalizationUndoingShrink:true,noEncodeDuringGestures:true,movementAllowsOverflow:true,presetResizeKeepsFrame:true,numericSizeResizeKeepsFrame:true,layoutAndReloadRestoreCanvas:true,originalUnchanged:true,output:{file:saved.path,width:meta.width,height:meta.height,bytes:bytes.length,limit:10000000,sha256:createHash('sha256').update(bytes).digest('hex'),opaqueToEveryEdge:true}};
  await fs.writeFile(path.join(artifact,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));win.destroy();app.quit();
 }finally{
  const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('qingtu-resize-canvas-'))throw new Error('Unsafe cleanup');await fs.rm(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);app.exit(1);});
