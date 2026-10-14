const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {start}=require('./main.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(win,expr){for(let n=0;n<600;n++){if(await win.webContents.executeJavaScript(expr))return;await pause(100);}throw new Error('Timed out: '+expr);}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-fixed-'));
 try{
  const artifact=path.resolve('artifacts/fixed-canvas');await fs.mkdir(artifact,{recursive:true});
  const testFiles=['01-alpine.jpg','02-cabin.jpg','03-coast.jpg','04-alpine.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name));
  const {win,store,stitching,service}=await start({hidden:true,projectRoot:path.join(root,'projects'),testFiles,testFolder:artifact});win.webContents.setBackgroundThrottling(false);win.show();win.focus();
  const js=expr=>win.webContents.executeJavaScript(expr),edit=(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  let calls=0;const render=stitching.render.bind(stitching);stitching.render=(...args)=>{calls++;return render(...args);};
  const ready=()=>waitFor(win,"document.querySelector('.save-status')?.textContent==='已自动保存'&&document.querySelector('.stitch-info')?.textContent.includes(' MB')&&!document.querySelector('.project-name').disabled");
  const load=async()=>store.load((await store.list())[0].id);
  const capture=async name=>fs.writeFile(path.join(artifact,name),(await win.webContents.capturePage()).toPNG());
  async function drag(selector,dx,dy,shift=false){
   await ready();await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
   const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),before=calls;
   win.webContents.debugger.attach('1.3');
   try{
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1,modifiers:shift?8:0});
    for(let n=1;n<=12;n++)await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*n/12,y:point.y+dy*n/12,buttons:1,modifiers:shift?8:0});
    await waitFor(win,"document.querySelector('.stitch-canvas').dataset.interacting==='true'");assert.equal(calls,before,'live gestures never encode');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',buttons:0,clickCount:1,modifiers:shift?8:0});
   }finally{win.webContents.debugger.detach();}
   await ready();
  }
  await waitFor(win,"!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");await waitFor(win,"!!document.querySelector('[aria-label=\"新建画布\"]')&&!document.querySelector('[aria-label=\"新建画布\"]').disabled");assert.equal((await store.list()).length,0);await js("document.querySelector('[aria-label=\"新建画布\"]').click()");await waitFor(win,"!!document.querySelector('[aria-label=\"添加拼接图片\"]')&&!document.querySelector('.project-name').disabled");
  assert.deepEqual(await js("[document.querySelector('#stitch-width').value,document.querySelector('#stitch-height').value]"),['5995','2398']);assert.equal(await js("document.querySelector('.stitch-canvas').dataset.canvasWidth"),'5995');
  await edit('#stitch-target',40);await js("document.querySelector('[aria-label=\"添加拼接图片\"]').click()");await ready();let p=await load();assert.equal(p.images.length,4);assert.equal(p.canvasMode,'fixed');assert.ok(p.positions[p.images[3].id].x+p.positions[p.images[3].id].width>5995);
  const reports=[],sharp=(await import('sharp')).default;
  async function saveSnapshot(name){const value=await load(),result=await stitching.render({...value,name}),saved=await service.save(result.token,artifact),buffer=await fs.readFile(saved.path),meta=await sharp(buffer).metadata();assert.ok(saved.bytes<=value.export.targetBytes);assert.equal(buffer.length,saved.bytes);assert.deepEqual([meta.width,meta.height],[value.canvas.width,value.canvas.height]);reports.push({name:path.basename(saved.path),width:meta.width,height:meta.height,bytes:saved.bytes,limit:value.export.targetBytes,sha256:createHash('sha256').update(buffer).digest('hex')});return result;}
  await capture('right-append.png');await saveSnapshot('fixed-right-append');
  await js("document.querySelector('[data-layout=horizontal]').click()");await ready();p=await load();assert.deepEqual(p.canvas,{width:5995,height:2398});assert.ok(p.positions[p.images[0].id].y>0);await capture('full-preset.png');
  const originalOrder=p.images.map(i=>i.id),first=p.images[0].id;
  await drag('.stitch-layer',-40,-20);p=await load();assert.ok(p.positions[first].x<0&&p.positions[first].y<0);assert.deepEqual(p.canvas,{width:5995,height:2398});assert.deepEqual(p.images.map(i=>i.id),originalOrder);
  const initial=p.positions[first];await drag('[data-handle=se]',30,0);p=await load();let pose=p.positions[first];assert.ok(Math.abs(pose.width/pose.height-initial.width/initial.height)<1e-9);assert.ok(pose.width>initial.width);
  const proportional={...pose};await drag('[data-handle=e]',22,0,true);p=await load();pose=p.positions[first];assert.ok(pose.width>proportional.width);assert.ok(Math.abs(pose.height-proportional.height)<1e-9);assert.ok(Math.abs(pose.width/pose.height-proportional.width/proportional.height)>.01);assert.deepEqual(p.canvas,{width:5995,height:2398});
  await capture('shift-and-clipping.png');await saveSnapshot('fixed-shift-clipped');
  const reads=await Promise.all(p.images.map(i=>store.readAsset(i.assetId)));for(let n=0;n<reads.length;n++)assert.ok(reads[n].equals(await fs.readFile(testFiles[n])),'original assets stay byte identical');
  await edit('#stitch-width',600);await edit('#stitch-height',300);await ready();await js("document.querySelector('.canvas-optimize').click()");await waitFor(win,"document.querySelector('.stitch-dialog h2')?.textContent==='优化完成'");await js("document.querySelector('.dialog-confirm').click()");await ready();p=await load();assert.deepEqual(p.canvas,{width:600,height:300});assert.ok(p.images.every(i=>Math.abs(p.edits[i.id].fraction-5/42)<1e-12));assert.ok(Object.values(p.positions).every(pose=>Math.abs(pose.y)<1e-9&&Math.abs(pose.height-300)<1e-9));assert.equal(await js("document.querySelector('.canvas-optimize').disabled"),true);
  await capture('custom-ratio-optimized.png');await saveSnapshot('fixed-2-to-1-optimized');
  let before=calls;await edit('#stitch-width',6000);await waitFor(win,"document.querySelector('[role=alert]')?.textContent.includes('5999')");await pause(650);assert.equal(calls,before);assert.equal(await js("document.querySelector('.module-content:not([hidden]) .export-button').disabled"),true);
  await edit('#stitch-width',600);await edit('#stitch-height',200);await waitFor(win,"document.querySelector('[role=alert]')?.textContent.includes('比例超过 2.5')");await pause(650);assert.equal(calls,before);await edit('#stitch-height',300);await ready();
  const restored=await load();await win.webContents.reload();await waitFor(win,"!!document.querySelector('[aria-label=\"图像拼接\"]')");await js("document.querySelector('[aria-label=\"图像拼接\"]').click()");await ready();const reopened=await load();assert.deepEqual(reopened.positions,restored.positions);assert.deepEqual(reopened.canvas,restored.canvas);assert.deepEqual(reopened.edits,restored.edits);
  const result={passed:true,platform:process.platform,source:'Reproducible 4K-size fixtures derived from repository photo samples',fixedDefault:[5995,2398],allHandles:8,defaultProportional:true,shiftIndependent:true,noEncodeDuringGestures:true,negativeCoordinatesClip:true,rightAppendOverflowRetained:true,presetDoesNotResizeCanvas:true,optimizeUsesCustomCanvasRatio:true,originalBytesIdentical:true,edgeAndRatioLimits:true,reloadRestoresTransforms:true,exports:reports};
  await fs.writeFile(path.join(artifact,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));win.destroy();app.quit();
 }finally{const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('qingtu-fixed-'))throw new Error('Unsafe temporary cleanup');await fs.rm(resolved,{recursive:true,force:true});}
})().catch(error=>{console.error(error);app.exit(1);});
