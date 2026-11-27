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
  const activeToggle='.stitch-stage .panel-toggle, #stitch-export-inspector:not([inert]) .panel-toggle';
  for(const width of [900,800,761,760,600,375]){
   await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await s.js('new Promise(r=>setTimeout(r,350))');
   const state=await s.js(`(()=>{
    const panel=document.querySelector('#stitch-export-inspector'),stage=document.querySelector('.stitch-stage');
    const toggle=document.querySelector('${activeToggle}'),bounds=el=>el.getBoundingClientRect().toJSON();
    return {collapsed:document.querySelector('.app').classList.contains('inspector-collapsed'),inert:panel.inert,canvas:bounds(stage.querySelector('.stitch-canvas')),
     area:bounds(stage.querySelector('.stitch-canvas-area')),toggle:bounds(toggle),toggleIcon:bounds(toggle.querySelector('svg')),
     optimizer:bounds(stage.querySelector('.canvas-optimize-group')),heading:bounds(panel.querySelector('.inspector-heading')),
     inHeading:panel.querySelector('.inspector-heading').contains(toggle),buttonLabel:toggle.getAttribute('aria-label'),
     toolbarButtons:stage.querySelectorAll('.panel-toggle').length,headingButtons:panel.querySelectorAll('.inspector-heading button').length};
   })()`);
   cases.push({width,...state});
   if(width<=760)assert.ok(state.collapsed&&state.inert,'a narrow viewport automatically hides the inspector');
   if(width===760){const expected=Math.min(state.area.width-32,(state.area.height-32)*state.canvas.width/state.canvas.height);assert.ok(Math.abs(state.canvas.width-expected)<1,'automatic sidebar collapse refits the canvas into the released width: '+JSON.stringify({actual:state.canvas.width,expected}));}
   assert.equal(state.toolbarButtons,Number(state.collapsed));
   assert.equal(state.headingButtons,1,'the editing header only offers collapse');
   assert.equal(state.inHeading,!state.collapsed);
   assert.equal(state.buttonLabel,state.collapsed?'展开导出设置':'收起导出设置');
   assert.ok(Math.abs(state.toggleIcon.x+state.toggleIcon.width/2-state.toggle.x-state.toggle.width/2)<1&&Math.abs(state.toggleIcon.y+state.toggleIcon.height/2-state.toggle.y-state.toggle.height/2)<1,'the sidebar glyph is centred within its button');
   if(state.collapsed)assert.ok(state.toggle.left>state.optimizer.right,'expand sits beside optimization');
   else assert.ok(Math.abs(state.toggle.right-state.heading.right)<1,'collapse is at the right edge of the heading');
   assert.ok(state.toggle.left>=state.area.left&&state.toggle.right<=width,'the toggle remains inside the narrow workbench');
   assert.ok(Math.abs(state.canvas.left+state.canvas.width/2-state.area.left-state.area.width/2)<1,'canvas remains centred in the available work area');
  }
  async function resize(width){await s.win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await s.js('new Promise(r=>setTimeout(r,350))');}
  const isCollapsed=()=>s.js("document.querySelector('.app').classList.contains('inspector-collapsed')");
  await resize(1000);assert.equal(await isCollapsed(),false,'automatically collapsed settings reopen when the window grows');
  await resize(375);assert.equal(await isCollapsed(),true,'automatic responsiveness remains active until a manual choice');
  const toggleBounds=()=>s.js(`document.querySelector('${activeToggle}').getBoundingClientRect().toJSON()`);
  const before=await toggleBounds();
  async function clickToggle(){
   const r=await toggleBounds(),point={x:r.x+r.width/2,y:r.y+r.height/2};
   assert.ok(await s.js(`!!document.elementFromPoint(${point.x},${point.y})?.closest('${activeToggle}')`),'the visible toggle accepts pointer input');
   for(const type of ['mousePressed','mouseReleased'])await s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
   await s.js('new Promise(r=>setTimeout(r,350))');
  }
  await clickToggle();assert.equal(await isCollapsed(),false);
  assert.equal(await s.js(`document.querySelector('${activeToggle}').closest('.inspector-heading')!==null`),true);
  await s.capture('narrow-open.png');
  await clickToggle();assert.equal(await isCollapsed(),true);
  const closed=await toggleBounds();assert.ok(Math.abs(before.x-closed.x)<1&&Math.abs(before.y-closed.y)<1);
  await s.capture('narrow-closed.png');
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
  const imageGeometry=()=>s.js("(()=>{const c=document.querySelector('.stitch-canvas').getBoundingClientRect(),a=document.querySelector('.stitch-canvas-area').getBoundingClientRect(),i=document.querySelector('.stitch-layer').getBoundingClientRect();return {width:c.width,expected:Math.min(a.width-32,(a.height-24)*c.width/c.height),imageRatio:i.width/c.width}})()");
  await clickToggle();const withPanel=await imageGeometry();
  await clickToggle();const withoutPanel=await imageGeometry();
  assert.ok(Math.abs(withoutPanel.width-withoutPanel.expected)<1,'a canvas containing images refits after collapse');
  assert.ok(Math.abs(withPanel.width-withPanel.expected)<1,'the whole imported canvas fits with the panel open');
  assert.ok(Math.abs(withPanel.imageRatio-withoutPanel.imageRatio)<.001,'source image scales with the canvas');
  const savedAfter=await s.load();for(const key of ['canvas','positions','export'])assert.deepEqual(savedAfter[key],savedBefore[key],'display fitting preserves saved '+key);
  await s.capture('image-collapsed-fit.png');
  await s.click('[aria-label="放大视图"]');
  await s.wait("document.querySelector('.canvas-viewport-controls output').textContent==='125%'");
  await s.edit('#stitch-height',420);await s.ready();
  await s.wait("document.querySelector('.canvas-viewport-controls output').textContent==='100%'");
  await s.js("document.querySelector('.stitch-canvas-area').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))");
  for(const width of [980,761,375]){
   await resize(width);
   const measured=await s.js(`(()=>{
    const stage=document.querySelector('.stitch-stage'),rect=selector=>stage.querySelector(selector).getBoundingClientRect();
    const area=rect('.stitch-canvas-area'),canvas=rect('.stitch-canvas'),header=rect('.file-toolbar');
    const size=rect('.size-comparison'),dims=rect('.preview-dimensions'),bar=rect('.preview-info');
    return {topGap:area.top-header.bottom,fit:Math.min(area.width-32,(area.height-24)*canvas.width/canvas.height),width:canvas.width,
     sizeLeft:size.left,dimsRight:dims.right,sizeRight:size.right,barRight:bar.right,
     rowDistance:Math.abs(size.top+size.height/2-dims.top-dims.height/2)};
   })()`);
   assert.ok(measured.topGap<=6&&Math.abs(measured.fit-measured.width)<1,JSON.stringify(measured));
   assert.ok(measured.rowDistance<1&&measured.dimsRight<=measured.sizeLeft+1&&measured.sizeRight<=measured.barRight+1,JSON.stringify(measured));
  }
  await s.capture('narrow-single-line-footer.png');
 }finally{if(s.win.webContents.debugger.isAttached())s.win.webContents.debugger.detach();}
 await s.finish({passed:true,entirelyOffscreen:true,offscreenRendering:true,visible:s.win.isVisible(),windowBounds,displayBounds,opacity:0,noOSFocus:true,cases,narrowAutoCollapse:true,autoRestoreOnWide:true,manualChoiceSurvivesResize:true,collapseRefitsReleasedWidth:true,imageRefitsWithoutProjectChanges:true,canvasCentred:true,collapseInHeading:true,expandBesideOptimization:true,toggleIconCentred:true,realMouseToggleWorks:true});
})().catch(error=>{console.error(error);app.exit(1)});
