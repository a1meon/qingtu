const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createSmoke}=require('./portrait-smoke-helpers.cjs');
(async()=>{
 const s=await createSmoke('qingtu-content-canvas-','content-canvas'),sources=['01-alpine.jpg','02-cabin.jpg','03-coast.jpg','04-alpine.jpg'].map(name=>path.resolve('artifacts/stitch-fixtures',name));
 await s.edit('#stitch-width',600);await s.edit('#stitch-height',240);await s.importFiles([sources[0]]);const first=await s.load();assert.deepEqual(first.canvas,{width:180,height:240});
 await s.importFiles([sources[1]]);const second=await s.load();assert.deepEqual(second.canvas,{width:360,height:240});assert.deepEqual(second.positions[first.images[0].id],first.positions[first.images[0].id]);
 const points=await s.js("Array.from(document.querySelectorAll('.stitch-layer'),e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})");await s.drag('.stitch-layer',points[1].x-points[0].x,0);let p=await s.load();assert.deepEqual(p.images.map(i=>i.id),[...second.images].reverse().map(i=>i.id));assert.deepEqual(p.initialOrder,second.initialOrder);
 await s.importFiles(sources.slice(2));p=await s.load();assert.deepEqual(p.canvas,{width:600,height:240});assert.ok(p.positions[p.images.at(-1).id].x+p.positions[p.images.at(-1).id].width>600);assert.deepEqual(p.edits,{});assert.equal(await s.js("document.querySelector('.module-content:not([hidden]) .export-button').disabled"),false);await s.capture('height-capped.png');
 const output=await s.save('height-content-fit');await fs.writeFile(path.join(s.artifact,'project.json'),JSON.stringify(p));
 for(const image of p.images)assert.ok((await s.store.readAsset(image.assetId)).equals(await fs.readFile(sources.find(file=>path.basename(file)===image.name))));
 await s.click('[data-layout=grid]');await s.ready();await s.click('[data-layout=horizontal]');await s.ready();assert.deepEqual((await s.load()).positions,p.positions);assert.deepEqual((await s.load()).canvas,p.canvas);
 await s.win.webContents.reload();await s.wait("!!document.querySelector('[aria-label=\"图像拼接\"]')");await s.click('[aria-label="图像拼接"]');await s.ready();assert.deepEqual((await s.load()).positions,p.positions);
 await s.finish({passed:true,fixedHeight:true,everyImportFitsWidth:true,firstCanvas:first.canvas,secondCanvas:second.canvas,finalCanvas:p.canvas,directDragOrder:true,widthCapKeepsOverflow:true,noAutomaticCrop:true,layoutAndReloadRestore:true,originalsUnchanged:true,output});
})().catch(error=>{console.error(error);app.exit(1);});
