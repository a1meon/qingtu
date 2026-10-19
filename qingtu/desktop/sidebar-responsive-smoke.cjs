const {app,screen}=require('electron'),assert=require('node:assert/strict');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-sidebar-responsive-','sidebar-responsive'),cases=[];
 const windowBounds=s.win.getBounds(),displayBounds=screen.getAllDisplays().map(d=>d.bounds);
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible(),'tests render offscreen without a visible native window');
 assert.equal(s.win.getOpacity(),0);assert.equal(s.win.isFocused(),false);
 assert.ok(displayBounds.every(d=>windowBounds.x>=d.x+d.width||windowBounds.y>=d.y+d.height||windowBounds.x+windowBounds.width<=d.x||windowBounds.y+windowBounds.height<=d.y),'test window bounds stay entirely outside every display');
 s.win.webContents.debugger.attach('1.3');
 try{
  await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  for(const width of [900,800,761,760,600,375]){
   await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await s.js('new Promise(r=>setTimeout(r,350))');
   const state=await s.js("(()=>{const root=document.querySelector('.stitch-stage'),b=root.querySelector('.stitch-panel-toggle'),o=root.querySelector('.canvas-optimize-group'),canvas=root.querySelector('.stitch-canvas').getBoundingClientRect(),area=root.querySelector('.stitch-canvas-area').getBoundingClientRect(),panel=document.querySelector('[aria-label=图像编辑导出设置]');return {collapsed:document.querySelector('.app').classList.contains('inspector-collapsed'),inert:panel.inert,canvas:canvas.toJSON(),area:area.toJSON(),toggle:b?.getBoundingClientRect().toJSON(),toggleIcon:b?.querySelector('svg').getBoundingClientRect().toJSON(),optimizer:o.getBoundingClientRect().toJSON(),buttonLabel:b?.getAttribute('aria-label'),inspectorButtons:panel.querySelectorAll('.panel-toggle').length}})()");
   cases.push({width,...state});
   if(width<=760)assert.ok(state.collapsed&&state.inert,'a narrow viewport automatically hides the inspector');
   if(width===760){const expected=Math.min(state.area.width-32,(state.area.height-32)*state.canvas.width/state.canvas.height);assert.ok(Math.abs(state.canvas.width-expected)<1,'automatic sidebar collapse refits the canvas into the released width: '+JSON.stringify({actual:state.canvas.width,expected}));}
   assert.ok(state.toggle,'one toolbar toggle exists in both states');assert.equal(state.inspectorButtons,0);
   assert.ok(Math.abs(state.toggleIcon.x+state.toggleIcon.width/2-state.toggle.x-state.toggle.width/2)<1&&Math.abs(state.toggleIcon.y+state.toggleIcon.height/2-state.toggle.y-state.toggle.height/2)<1,'the sidebar glyph is centred within its button');
   assert.ok(state.toggle.left>state.optimizer.right&&Math.abs(state.toggle.top+state.toggle.height/2-state.optimizer.top-state.optimizer.height/2)<1,'the toggle stays aligned to the right of optimization');
   assert.ok(state.toggle.left>=state.area.left&&state.toggle.right<=width,'the toggle remains inside the narrow workbench');
   assert.ok(Math.abs(state.canvas.left+state.canvas.width/2-state.area.left-state.area.width/2)<1,'canvas remains centred in the available work area');
  }
  async function resize(width){await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await s.js('new Promise(r=>setTimeout(r,350))');}
  const isCollapsed=()=>s.js("document.querySelector('.app').classList.contains('inspector-collapsed')");
  await resize(1000);assert.equal(await isCollapsed(),false,'automatically collapsed settings reopen when the window grows');
  await resize(375);assert.equal(await isCollapsed(),true,'automatic responsiveness remains active until a manual choice');
  const before=await s.js("document.querySelector('.stitch-panel-toggle').getBoundingClientRect().toJSON()");
  async function clickToggle(){const r=await s.js("document.querySelector('.stitch-panel-toggle').getBoundingClientRect().toJSON()"),point={x:r.x+r.width/2,y:r.y+r.height/2};assert.ok(await s.js(`!!document.elementFromPoint(${point.x},${point.y})?.closest('.stitch-panel-toggle')`),'an open inspector never covers its toolbar toggle');for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await s.js('new Promise(r=>setTimeout(r,350))');}
  await clickToggle();assert.equal(await s.js("document.querySelector('[aria-label=图像编辑导出设置]').inert"),false);assert.equal(await s.js("document.querySelector('.stitch-panel-toggle').getAttribute('aria-label')"),'收起导出设置');
  const opened=await s.js("document.querySelector('.stitch-panel-toggle').getBoundingClientRect().toJSON()");assert.ok(Math.abs(before.x-opened.x)<1&&Math.abs(before.y-opened.y)<1,'opening a narrow inspector retains the exact toggle position');await s.capture('narrow-open.png');
  await clickToggle();assert.equal(await s.js("document.querySelector('[aria-label=图像编辑导出设置]').inert"),true);const closed=await s.js("document.querySelector('.stitch-panel-toggle').getBoundingClientRect().toJSON()");assert.ok(Math.abs(before.x-closed.x)<1&&Math.abs(before.y-closed.y)<1);await s.capture('narrow-closed.png');
  await resize(1000);assert.equal(await isCollapsed(),true,'manual collapse wins when the window grows');
  await resize(375);assert.equal(await isCollapsed(),true,'manual collapse survives another narrow transition');
  await clickToggle();assert.equal(await isCollapsed(),false,'the user can manually reopen a narrow inspector');
  await resize(1000);assert.equal(await isCollapsed(),false,'manual expansion survives a wide transition');
  await resize(375);assert.equal(await isCollapsed(),false,'manual expansion wins when the window shrinks');
  await resize(1000);await clickToggle();
  const manualFit=await s.js("(()=>{const c=document.querySelector('.stitch-canvas').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect();return {width:c.width,expected:Math.min(a.width-32,(a.height-32)*c.width/c.height)}})()");
  assert.ok(Math.abs(manualFit.width-manualFit.expected)<1,'manual collapse also refits the available workspace');
  await s.capture('wide-collapsed-fit.png');
  // Give this original enough height to make available width the limiting axis.
  await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1000,height:1100,deviceScaleFactor:1,mobile:false});await s.js('new Promise(r=>setTimeout(r,350))');
  await s.importFiles([require('node:path').resolve('public/samples/alpine-lake.jpg')]);
  const savedBefore=await s.load();
  const imageGeometry=()=>s.js("(()=>{const c=document.querySelector('.stitch-canvas').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect(),i=document.querySelector('.stitch-layer').getBoundingClientRect();return {width:c.width,expected:Math.min(a.width-32,(a.height-68)*c.width/c.height),imageRatio:i.width/c.width}})()");
  await clickToggle();const withPanel=await imageGeometry();
  await clickToggle();const withoutPanel=await imageGeometry();
  assert.ok(Math.abs(withoutPanel.width-withoutPanel.expected)<1,'a canvas containing images refits after collapse');
  assert.ok(withoutPanel.width>withPanel.width+1,'images expand with the released workspace: '+JSON.stringify({withPanel,withoutPanel}));
  assert.ok(Math.abs(withPanel.imageRatio-withoutPanel.imageRatio)<.001,'source image scales with the canvas');
  const savedAfter=await s.load();for(const key of ['canvas','positions','export'])assert.deepEqual(savedAfter[key],savedBefore[key],'display fitting preserves saved '+key);
  await s.capture('image-collapsed-fit.png');



 }finally{if(s.win.webContents.debugger.isAttached())s.win.webContents.debugger.detach();}
 await s.finish({passed:true,entirelyOffscreen:true,offscreenRendering:true,visible:s.win.isVisible(),windowBounds,displayBounds,opacity:0,noOSFocus:true,cases,narrowAutoCollapse:true,autoRestoreOnWide:true,manualChoiceSurvivesResize:true,collapseRefitsReleasedWidth:true,imageRefitsWithoutProjectChanges:true,canvasCentred:true,oneToggleRightOfOptimization:true,toggleIconCentred:true,exactNarrowTogglePosition:true,realMouseToggleWorks:true});
})().catch(error=>{console.error(error);app.exit(1)});
