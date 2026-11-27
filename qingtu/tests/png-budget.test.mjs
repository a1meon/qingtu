import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {encodePngWithinBudget} from '../engine/png-budget.mjs';
import {pixelDifference} from '../engine/png-quality.mjs';
import {processImage} from '../engine/image.mjs';
import {ImageService} from '../engine/service.mjs';
import {ProjectStore} from '../engine/project-store.mjs';
import {StitchService,composeProject} from '../engine/stitch-service.mjs';

function noisy(width=200,height=120,channels=4){
 const info={width,height,channels},data=Buffer.alloc(width*height*channels);let seed=1729;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
 return {data,info};
}
for(const target of [1000,10000,25000])test(`PNG adapts colour and detail for a ${target}-byte ceiling at the original resolution`,async()=>{
 const {data,info}=noisy(),before=Buffer.from(data);
 const r=await encodePngWithinBudget(data,info,target),meta=await sharp(r.buffer).metadata();
 assert.ok(r.buffer.length<=target);assert.deepEqual([meta.width,meta.height],[info.width,info.height]);assert.equal(meta.format,'png');
 assert.equal(r.lossless,false);assert.match(r.encoding,/调色板|简化|减色/);
 assert.ok(data.equals(before));
});
test('a fitting full-colour PNG retains dimensions and does not consume the rest of its budget',async()=>{
 const {data,info}=noisy(40,24),r=await encodePngWithinBudget(data,info,1000000);
 assert.equal(r.autoResized,false);assert.equal(r.lossless,true);assert.deepEqual([r.width,r.height],[40,24]);assert.ok(r.buffer.length<10000);assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(data));
});
test('PNG still rejects invalid or physically impossible sub-header budgets',async()=>{
 const {data,info}=noisy(5,2);await assert.rejects(encodePngWithinBudget(data,info,64),/KB 起/);
 const source=await sharp(data,{raw:info}).png().toBuffer();await assert.rejects(processImage(source,{mode:'smart',format:'png',targetBytes:0}),/目标大小/);
});
test('obsolete PNG work stops before returning a result instead of swallowing cancellation',async()=>{
 const {data,info}=noisy(207,123);let checks=0;
 await assert.rejects(encodePngWithinBudget(data,info,1000,{isObsolete:()=>++checks>3}),/预览参数已更新/);
});
test('compression preview bytes match the saved PNG under a tight ceiling',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-png-budget-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {data,info}=noisy(),source=await sharp(data,{raw:info}).png().toBuffer(),service=new ImageService(),item=await service.add(source,'transparent.png');
 const settings={mode:'smart',format:'png',targetBytes:1000,resize:{type:'scale',percent:100}};
 const preview=await service.process(item.id,settings,{latest:true}),output=await service.process(item.id,settings);
 assert.deepEqual([preview.width,preview.height],[info.width,info.height]);assert.equal(preview.bytes,output.bytes);
 const saved=await service.save(output.token,root),meta=await sharp(saved.path).metadata();assert.equal(saved.bytes,(await fs.stat(saved.path)).size);assert.ok(saved.bytes<=settings.targetBytes);assert.deepEqual([meta.width,meta.height],[preview.width,preview.height]);assert.ok(service.original(item.id).buffer.equals(source));
});
test('tight stitch preview, batch export and restored settings preserve source/crops and exact 2.5:1',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-stitch-png-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new ProjectStore(path.join(root,'store')),images=new ImageService(),service=new StitchService(store,images),{data,info}=noisy(300,120);
 const source=await sharp(data,{raw:info}).png().toBuffer(),item=await store.import(source,'noisy.png');delete item.preview;
 const project={id:'strict-budget',name:'budget',images:[item],initialOrder:[item.id],layout:'horizontal',export:{longEdge:600,format:'png',targetBytes:1000}};await store.save(project);
 const tight=await service.render(project,{latest:true}),ready=await service.render(await store.load(project.id));
 const tightFile=await images.save(ready.token,root),previewPixels=Buffer.from(tight.preview.split(',')[1],'base64');
 assert.equal(tight.bytes,tightFile.bytes);assert.ok(tightFile.bytes<=1000);
 assert.deepEqual(await sharp(tightFile.path).ensureAlpha().raw().toBuffer(),await sharp(previewPixels).ensureAlpha().raw().toBuffer());
 project.export.targetBytes=1000000;await store.save(project);
 const composed=await composeProject(project,store),preview=await service.render(project,{latest:true}),exported=await service.render(await store.load(project.id)),saved=await images.save(exported.token,root);
 const meta=await sharp(saved.path).metadata();assert.equal(preview.autoResized,false);assert.deepEqual([meta.width,meta.height],[preview.width,preview.height]);assert.equal(meta.width*2,meta.height*5);assert.equal(meta.isPalette,false);assert.ok(saved.bytes<=project.export.targetBytes);assert.equal(preview.bytes,saved.bytes);
 assert.deepEqual([preview.layout.width,preview.layout.height],[600,240]);assert.deepEqual((await store.load(project.id)).export,project.export);assert.ok((await store.readAsset(item.assetId)).equals(source));
 assert.deepEqual([meta.width,meta.height],[600,240]);const expected=composed.data;assert.equal(pixelDifference(expected,await sharp(saved.path).raw().toBuffer(),4).alphaMaxError,0);
 const second={...project,id:'budget-two',name:'second',export:{...project.export,targetBytes:800000}};await store.save(second);const out=await service.render(second),file=await images.save(out.token,root);assert.ok(file.bytes<=second.export.targetBytes);assert.notEqual(file.path,saved.path);
});

test('a photo uses the PNG budget for real image data at the chosen resolution',async()=>{
 const photo=await fs.readFile(new URL('../public/samples/alpine-lake.jpg',import.meta.url));
 const r=await processImage(photo,{mode:'smart',format:'png',targetBytes:300000,resize:{type:'pixels',width:1200,height:800,locked:false}});
 const meta=await sharp(r.buffer).metadata();assert.deepEqual([meta.format,meta.width,meta.height],['png',1200,800]);
 assert.ok(r.buffer.length>=297000&&r.buffer.length<=300000);assert.equal(r.paddedBytes,0);
});

test('packed palette rows decode at odd widths with partial and fully transparent entries',async()=>{
 const {indexedPng,deflatePixels}=await import('../engine/indexed-png.mjs');
 for(const count of [2,4,16,33]){
  const width=19,height=7,grid={width,height};
  const palette=Array.from({length:count},(_,i)=>[i*3,i*5,i*7,i===0?0:i===1?128:255]);
  const indices=Uint8Array.from({length:width*height},(_,i)=>i%count);
  const bytes=await indexedPng(grid,palette,indices,Uint8Array.from(palette,(_,i)=>i),width,height,deflatePixels);
  const actual=await sharp(bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual(actual,Buffer.from(Array.from(indices).flatMap(i=>palette[i])));
 }
});

test('cancellation during a palette probe preserves the newer preview request',async()=>{
 const {adaptivePng}=await import('../engine/adaptive-png.mjs');
 const {deflatePixels}=await import('../engine/indexed-png.mjs');
 const {data,info}=noisy();let obsolete=false;
 await assert.rejects(adaptivePng(data,info,2000,{losslessBytes:data.length,isObsolete:()=>obsolete,
  deflate:async bytes=>{const result=await deflatePixels(bytes);obsolete=true;return result;},
 }),/预览参数已更新/);
});

test('a small original palette can meet a tight ceiling without changing even semi-transparent pixels',async()=>{
 const width=203,height=127,info={width,height,channels:4},data=Buffer.alloc(width*height*4);
 let seed=105;
 const palette=Array.from({length:11},(_,i)=>[i*13,255-i*17,i*21,i*25]);
 for(let p=0;p<width*height;p++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;data.set(palette[(seed>>>16)%11],p*4);
 }
 const result=await encodePngWithinBudget(data,info,13000);
 assert.equal(result.lossless,true);assert.ok(result.buffer.length<=13000);
 assert.deepEqual(await sharp(result.buffer).ensureAlpha().raw().toBuffer(),data);
});
