const {app}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-compression-preview-','compression-preview',{createCanvas:false}),sharp=(await import('sharp')).default;
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible());assert.equal(s.win.isFocused(),false);
 const files=[],colours=['#ff0000','#00ff00','#0000ff','#ffff00'];
 for(const [n,width,height] of [[0,120,240],[1,360,90]]){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${colours.map((fill,i)=>`<rect x="${n?i*width/4:0}" y="${n?0:i*height/4}" width="${n?width/4:width}" height="${n?height:height/4}" fill="${fill}"/>`).join('')}</svg>`,file=path.join(s.root,n?'wide.png':'portrait.png');await sharp(Buffer.from(svg)).png().toFile(file);files.push(file);}
 let release,gate=new Promise(resolve=>release=resolve),failNext=false;const processImage=s.service.process.bind(s.service);
 s.service.process=async(...args)=>{if(args[2]?.latest){await gate;if(failNext){failNext=false;throw new Error('测试：处理失败');}}return processImage(...args);};
 s.win.webContents.debugger.attach('1.3');await s.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.click('[aria-label="压缩调整"]');const {root:doc}=await s.win.webContents.debugger.sendCommand('DOM.getDocument'),{nodeId}=await s.win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.nodeId,selector:'input[type=file]'});await s.win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files});
 await s.wait("document.querySelectorAll('.compression-card').length===2&&document.querySelector('.size-comparison')?.textContent.includes('计算中')");
 assert.equal(await s.js("document.querySelector('.processed-label')?.textContent"),'原图','pending images start in the original view');
 await s.click('[aria-label="对比原图与结果"]');
 await s.js("Promise.all([...document.querySelectorAll('.compression-card img,.original-image')].map(i=>i.decode()))");
 await s.js("Promise.all([...document.querySelectorAll('.compression-card')].flatMap(e=>e.getAnimations()).map(a=>a.finished.catch(()=>{})))");
 assert.equal(await s.js("!!document.querySelector('.preview-loading-source')"),true,'pending processing must show a dimmed source placeholder rather than a blank half');
 const loading=await s.js("(()=>{const c=document.querySelector('.comparator'),i=c.querySelector('.preview-loading-source'),o=c.querySelector('.original-image'),cs=getComputedStyle(i);return {sourceMatches:i.src===o.src,opacity:Number(cs.opacity),filter:cs.filter,spinner:!!c.querySelector('.preview-loading-spinner .spin'),busy:c.getAttribute('aria-busy'),noActualResult:!c.querySelector('.processed-image')}})()");
 assert.ok(loading.sourceMatches&&loading.opacity>0&&loading.opacity<1&&loading.spinner&&loading.noActualResult);assert.equal(loading.busy,'true');
 const imageLoader=await s.js("(()=>{const c=document.querySelector('.comparator').getBoundingClientRect(),i=document.querySelector('.original-image'),p=document.querySelector('.preview-loading-spinner').getBoundingClientRect(),w=Math.min(c.width,c.height*i.naturalWidth/i.naturalHeight);return {actual:p.x+p.width/2,expected:c.x+(c.width/2+(c.width+w)/2)/2}})()");assert.ok(Math.abs(imageLoader.actual-imageLoader.expected)<1,'portrait loading indicator stays over the visible image half: '+JSON.stringify(imageLoader));
 const thumbnails=await s.js("[...document.querySelectorAll('.compression-card .film-select img')].map(i=>({fit:getComputedStyle(i).objectFit,rect:i.getBoundingClientRect().toJSON(),width:i.naturalWidth,height:i.naturalHeight}))");assert.ok(thumbnails.every(i=>i.fit==='contain'),'portrait and wide cards must display the complete image');
 await s.capture('pending-and-full-thumbnails.png');
 const shot=await s.win.webContents.capturePage(),pixels=await sharp(shot.toPNG()).ensureAlpha().raw().toBuffer({resolveWithObject:true}),ratio=shot.getSize().width/await s.js('innerWidth');
 function pixel(x,y){const p=(Math.round(y*ratio)*pixels.info.width+Math.round(x*ratio))*4;return [...pixels.data.subarray(p,p+3)];}
 for(const [n,t] of thumbnails.entries()){const factor=Math.min(t.rect.width/t.width,t.rect.height/t.height),w=t.width*factor,h=t.height*factor,left=t.rect.x+(t.rect.width-w)/2,top=t.rect.y+(t.rect.height-h)/2;assert.deepEqual(pixel(left+w*(n?.12:.5),top+h*(n?.5:.12)),[255,0,0],'first colour band must remain visible');assert.deepEqual(pixel(left+w*(n?.88:.5),top+h*(n?.5:.88)),[255,255,0],'last colour band must remain visible');}
 await s.edit('.compare-slider',75);await s.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 async function spinnerAt(fraction){const r=await s.js("(()=>{const c=document.querySelector('.comparator').getBoundingClientRect(),i=document.querySelector('.preview-loading-spinner').getBoundingClientRect();return {actual:i.x+i.width/2,left:c.x,width:c.width}})()");assert.ok(Math.abs(r.actual-r.left-r.width*fraction)<1,'spinner follows the visible pending half');}
 await spinnerAt(.875);await s.capture('pending-split-75.png');
 await s.click('[aria-label="查看处理后图片"]');await spinnerAt(.5);await s.capture('pending-processed-only.png');
 await s.click('[aria-label="查看原图"]');assert.equal(await s.js("!!document.querySelector('.preview-loading')"),false);assert.equal(await s.js("document.querySelector('.processed-label').textContent"),'原图');
 await s.click('[aria-label="对比原图与结果"]');release();await s.wait("!!document.querySelector('.processed-image')&&!document.querySelector('.preview-loading')&&document.querySelector('.processed-label').textContent.startsWith('处理后')");assert.equal(await s.js("document.querySelector('.comparator').getAttribute('aria-busy')"),'false');await s.capture('actual-result-ready.png');
 const nav='.canvas-viewport-controls';
 const control=label=>s.click(nav+' [aria-label="'+label+'"]');
 const compare=s.js;
 const matrix=selector=>compare(`(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('${selector}')).transform);return [m.a,m.e,m.f]})()`);
 // The portrait only overflows horizontally once sufficiently enlarged.
 for(let i=0;i<24;i++)await control('放大视图');
 const area=await compare("document.querySelector('.comparator').getBoundingClientRect().toJSON()");
 const point={x:area.x+area.width*.45,y:area.y+area.height*.45};
 const mouse=(type,props)=>s.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,...props});
 const drag=async(dx,dy,button='left')=>{
  const buttons=button==='middle'?4:1;
  await mouse('mouseMoved',{buttons:0});
  await mouse('mousePressed',{button,buttons,clickCount:1});
  await mouse('mouseMoved',{x:point.x+dx,y:point.y+dy,buttons});
  await mouse('mouseReleased',{x:point.x+dx,y:point.y+dy,button,buttons:0,clickCount:1});
 };
 await drag(30,20,'middle');
 await s.wait("document.querySelector('.comparator').style.getPropertyValue('--preview-y')==='20px'");
 const moved=await matrix('.processed-image');assert.deepEqual(moved,[7,30,20]);assert.deepEqual(await matrix('.original-image'),moved);
 assert.equal(await compare("document.querySelector('.compare-slider').value"),'75','panning moves both images together without moving the divider');
 await drag(-30,0);assert.ok(Number(await compare("document.querySelector('.compare-slider').value"))<50);
 assert.deepEqual(await matrix('.processed-image'),moved);
 await s.click('[aria-label="查看处理后图片"]');
 await s.click('[aria-label="查看原图"]');await s.wait("!!document.querySelector('.comparator.single-view[data-pan-mode] img[alt=原始图片]')");await drag(-20,-10);await s.wait("document.querySelector('.comparator').style.getPropertyValue('--preview-x')==='10px'");assert.deepEqual(await matrix('.compare-image'),[7,10,10]);
 await s.click('[aria-label="查看处理后图片"]');await s.wait("!!document.querySelector('.single-view .processed-image')");await drag(-10,-10);await s.wait("document.querySelector('.comparator').style.getPropertyValue('--preview-x')==='0px'");assert.deepEqual(await matrix('.processed-image'),[7,0,0]);
 await control('复位视图');assert.deepEqual(await matrix('.processed-image'),[1,0,0]);
 await s.click('[aria-label="对比原图与结果"]');
 gate=new Promise(resolve=>release=resolve);await s.click('[aria-label="预览 wide"]');await s.wait("document.querySelector('.file-toolbar-name').value==='wide'&&document.querySelector('.processed-label')?.textContent==='原图'");await s.click('[aria-label="对比原图与结果"]');await s.wait("!!document.querySelector('.preview-loading-source')");assert.equal(await s.js("document.querySelector('.preview-loading-source').src===document.querySelectorAll('.compression-card img')[1].src"),true,'switching images never uses the previous source as its placeholder');release();await s.wait("!!document.querySelector('.processed-image')&&!document.querySelector('.preview-loading')");
 failNext=true;await s.edit('#scale',50);await s.wait("document.querySelector('.processed-label')?.textContent==='未生成'");assert.equal(await s.js("!!document.querySelector('.preview-loading,.preview-loading-spinner')"),false,'failed processing never leaves a fake spinner');
 await s.finish({passed:true,offscreen:true,previewPanInAllViews:true,thumbnailsContainPortraitAndWide:true,actualCornerBandsVisible:true,dimmedFullSizeOriginalDuringProcessing:true,spinnerFollowsComparisonSplit:true,portraitSpinnerOverImage:true,processedOnlyPlaceholder:true,originalViewUnchanged:true,realResultReplacesPlaceholder:true,correctPlaceholderAfterImageSwitch:true,errorStopsSpinner:true,loading});
})().catch(error=>{console.error(error);app.exit(1)});
