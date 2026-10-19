const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-image-position-','image-position'),sharp=(await import('sharp')).default;
 assert.ok(s.win.webContents.isOffscreen()&&!s.win.isVisible());assert.equal(s.win.isFocused(),false);
 await s.edit('#stitch-width',600);await s.edit('#stitch-height',240);
 const files=[];for(const [n,background] of ['#ff0000','#00ff00','#0000ff'].entries()){const file=path.join(s.root,`image-${n+1}.png`);await sharp({create:{width:180,height:240,channels:4,background}}).png().toFile(file);files.push(file);}
 await s.importFiles(files);let p=await s.load();const ids=p.images.map(i=>i.id),middle=ids[1],selector=`.stitch-layer[data-image-id="${middle}"]`;
 const scale=()=>s.js("document.querySelector('.stitch-canvas').getBoundingClientRect().width/Number(document.querySelector('#stitch-width').value)");
 await s.click(selector);const before=p.positions[middle],factor=await scale();
 await s.drag('[data-handle=nw]',before.width*.5*factor,before.height*.5*factor);p=await s.load();
 const shrunk=structuredClone(p),small=p.positions[middle];assert.ok(Math.abs(small.height-120)<1);assert.ok(Math.abs(small.y+small.height-p.canvas.height)<1,'shrinking from the top leaves the image at the bottom');
 await s.capture('shrunk-at-bottom.png');
 async function moveTo(y){const current=(await s.load()).positions[middle];await s.drag(selector,0,(y-current.y)*await scale());const next=await s.load();assert.ok(Math.abs(next.positions[middle].y-y)<1,'dragging within the same horizontal slot must save the requested vertical position: '+JSON.stringify({requested:y,actual:next.positions[middle]}));assert.deepEqual(next.images.map(i=>i.id),ids,'moving vertically retains image order');assert.deepEqual(next.canvas,shrunk.canvas);assert.equal(next.layout,'horizontal');assert.deepEqual(next.initialOrder,shrunk.initialOrder);for(const id of [ids[0],ids[2]])assert.deepEqual(next.positions[id],shrunk.positions[id]);return next;}
 await moveTo(0);await s.capture('middle-at-top.png');await moveTo(40);await moveTo(120);const top=await moveTo(0);
 const output=await s.save('middle-image-at-top'),raw=await sharp(output.file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),x=Math.floor(top.positions[middle].x+top.positions[middle].width/2);
 const pixel=y=>Array.from(raw.data.subarray((y*raw.info.width+x)*4,(y*raw.info.width+x)*4+4));assert.deepEqual(pixel(20),[0,255,0,255]);assert.equal(pixel(180)[3],0,'the export retains transparent space below the moved image');
 await s.win.webContents.reload();await s.wait("!!document.querySelector('.stitch-layer')");await s.ready();assert.deepEqual((await s.load()).positions,top.positions,'reopening preserves the moved position');
 const points=await s.js(`Array.from(document.querySelectorAll('.stitch-layer'),e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})`);
 await s.drag(selector,points[2].x-points[1].x,points[2].y-points[1].y);assert.deepEqual((await s.load()).images.map(i=>i.id),[ids[0],ids[2],ids[1]],'dropping onto another image still reorders');
 await s.finish({passed:true,offscreen:true,threeImages:true,shrinkMiddleThenMoveTop:true,arbitraryVerticalPosition:true,topAndBottomSnapping:true,otherImagesAndCanvasUnchanged:true,noEncodingDuringGestures:true,reopenPreservesPosition:true,actualExportPixels:true,reorderRetained:true,output});
})().catch(error=>{console.error(error);app.exit(1)});
