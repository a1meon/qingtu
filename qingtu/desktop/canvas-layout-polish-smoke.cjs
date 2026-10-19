const {app}=require('electron'),assert=require('node:assert/strict');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-layout-polish-','canvas-layout-polish'),sizes=[],background={focused:s.win.isFocused(),alwaysOnTop:s.win.isAlwaysOnTop()};
 assert.equal(background.focused,false,'verification does not activate the test window');assert.equal(background.alwaysOnTop,false);
 s.win.webContents.debugger.attach('1.3');
 try{
  await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  // Let each breakpoint transition settle; measure the actual drawn canvas.
  for(const width of [1140,1101,1100,1080,820,780,761,760,740]){
   await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
   await s.js('new Promise(resolve=>setTimeout(resolve,350))');
   const size=await s.js("(()=>{const c=document.querySelector('.stitch-canvas').getBoundingClientRect();return {width:c.width,height:c.height}})()"),collapsed=await s.js("document.querySelector('.app').classList.contains('inspector-collapsed')");
   if(sizes.length&&collapsed===sizes.at(-1).collapsed)assert.ok(size.width<=sizes.at(-1).canvas.width+1,'ordinary shrinking must not enlarge the canvas at '+width+': '+JSON.stringify({before:sizes.at(-1),after:size}));
   sizes.push({width,collapsed,canvas:size});
  }
  await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false});await s.js('new Promise(resolve=>setTimeout(resolve,350))');
  const geometry=await s.js("(()=>{const c=document.querySelector('.stitch-canvas').getBoundingClientRect(),b=document.querySelector('[aria-label=添加画布图片]').getBoundingClientRect(),i=(document.querySelector('.empty-artwork')||document.querySelector('.fixed-empty .empty-illustration')).getBoundingClientRect();return {canvas:c.toJSON(),button:b.toJSON(),image:i.toJSON()}})()");
  const {canvas:c,button:b,image:i}=geometry,shadow=b.height/40*5;
  assert.ok(b.width/c.width<.39,'the import button should be more compact');
  assert.ok(Math.abs((Math.min(i.left,b.left)+Math.max(i.right,b.right))/2-(c.left+c.width/2))<1,'visible artwork and button are horizontally centred');
  assert.ok(Math.abs((Math.min(i.top,b.top)+Math.max(i.bottom,b.bottom+shadow))/2-(c.top+c.height/2))<1,'visible artwork and button are vertically centred');
  await s.capture('centred-import.png');
 }finally{if(s.win.webContents.debugger.isAttached())s.win.webContents.debugger.detach();}
 // Rename fields grow with actual text glyphs and remain centred under the card.
 await s.js("document.querySelector('.canvas-name').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");await s.wait("!!document.querySelector('.canvas-name-input')");
 const widths=[];
 for(const name of ['图','画布 12','My.photo.v1','很长的画布名称需要保持可编辑并限制在卡片以内']){
  await s.edit('.canvas-name-input',name);await s.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const measured=await s.js("(()=>{const e=document.querySelector('.canvas-name-input'),r=e.getBoundingClientRect(),card=e.closest('.canvas-card').getBoundingClientRect(),cs=getComputedStyle(e),measure=document.createElement('canvas').getContext('2d');measure.font=cs.font;return {width:r.width,cardWidth:card.width,expected:measure.measureText(e.value).width+12,centre:r.x+r.width/2,cardCentre:card.x+card.width/2}})()");
  assert.ok(Math.abs(measured.width-Math.min(measured.cardWidth,measured.expected))<2,JSON.stringify({name,...measured}));assert.ok(Math.abs(measured.centre-measured.cardCentre)<1);widths.push({name,...measured});
 }
 await s.edit('.canvas-name-input','画布 12');await s.capture('content-width-rename.png');await s.js("document.querySelector('.canvas-name-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");await s.wait("!document.querySelector('.canvas-name-input')&&document.querySelector('.save-status').textContent==='已自动保存'");assert.equal((await s.load()).name,'画布 12');
 await s.finish({passed:true,background,shrinkingViewportWithoutSidebarChangeNeverEnlargesCanvas:true,sizes,centredCompactImport:true,renameFitsText:true,widths,renameSaved:true});
})().catch(error=>{console.error(error);app.exit(1)});
