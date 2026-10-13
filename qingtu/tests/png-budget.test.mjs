import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {encodePngWithinBudget,pngBudgetDimensions} from '../engine/png-budget.mjs';
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
for(const target of [1000,10000,25000])test(`PNG meets a ${target}-byte ceiling through proportional resampling, with exact output-sized alpha`,async()=>{
 const {data,info}=noisy(),before=Buffer.from(data),r=await encodePngWithinBudget(data,info,target),meta=await sharp(r.buffer).metadata();
 assert.ok(r.buffer.length<=target);assert.equal(meta.format,'png');assert.equal(meta.isPalette,false);assert.equal(meta.hasAlpha,true);assert.equal(r.autoResized,true);assert.ok(r.width<info.width&&r.height<info.height);
 assert.deepEqual([r.width,r.height],[meta.width,meta.height]);assert.deepEqual([r.requestedWidth,r.requestedHeight],[info.width,info.height]);assert.ok(Math.abs(r.width/info.width-r.height/info.height)<=1/info.height);assert.ok(data.equals(before));
 const baseline=await sharp(data,{raw:info}).resize(r.width,r.height,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer(),difference=pixelDifference(baseline,await sharp(r.buffer).raw().toBuffer(),4);
 assert.deepEqual(r.difference,difference);assert.ok(difference.maxError<=2&&difference.rmse<=1.5);assert.equal(difference.alphaMaxError,0);assert.equal(r.differenceReference,'output-sized raster');
});
test('a fitting full-colour PNG retains dimensions and does not consume the rest of its budget',async()=>{
 const {data,info}=noisy(40,24),r=await encodePngWithinBudget(data,info,1000000);
 assert.equal(r.autoResized,false);assert.equal(r.lossless,true);assert.deepEqual([r.width,r.height],[40,24]);assert.ok(r.buffer.length<10000);assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(data));
});
test('budget dimensions preserve strict 5:2 and stitch ratio/edge bounds without padding',()=>{
 for(const long of [5998,4999,3333,100,11,6,1]){
  const a=pngBudgetDimensions({width:5995,height:2398},long,{maxRatio:2.5});assert.equal(a.width*2,a.height*5);assert.ok(a.width<=5995&&a.height<=2398);
  const b=pngBudgetDimensions({width:2400,height:5999},long,{maxRatio:2.5});assert.ok(b.height/b.width<=2.5);assert.ok(b.height<=5999&&b.width<=2400);
 }
});
test('PNG still rejects invalid or physically impossible sub-header budgets',async()=>{
 const {data,info}=noisy(5,2);await assert.rejects(encodePngWithinBudget(data,info,64),/有效 PNG/);
 const source=await sharp(data,{raw:info}).png().toBuffer();await assert.rejects(processImage(source,{mode:'smart',format:'png',targetBytes:0}),/目标大小/);
});
test('obsolete PNG work stops before resizing instead of swallowing cancellation',async()=>{
 const {data,info}=noisy(207,123);let checks=0;
 await assert.rejects(encodePngWithinBudget(data,info,1000,{isObsolete:()=>++checks>3}),/预览参数已更新/);
});
test('compression preview and saved bytes share the actual reduced PNG dimensions',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-png-budget-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {data,info}=noisy(),source=await sharp(data,{raw:info}).png().toBuffer(),service=new ImageService(),item=await service.add(source,'transparent.png');
 const settings={mode:'smart',format:'png',targetBytes:1000,resize:{type:'scale',percent:100}},preview=await service.process(item.id,settings,{latest:true}),output=await service.process(item.id,settings);
 assert.equal(preview.autoResized,true);assert.deepEqual([preview.width,preview.height],[output.width,output.height]);assert.equal(preview.bytes,output.bytes);assert.equal(preview.requestedWidth,200);
 const saved=await service.save(output.token,root),meta=await sharp(saved.path).metadata();assert.equal(saved.bytes,(await fs.stat(saved.path)).size);assert.ok(saved.bytes<=1000);assert.deepEqual([meta.width,meta.height],[preview.width,preview.height]);assert.ok(service.original(item.id).buffer.equals(source));
});
test('tight stitch preview, batch export and restored settings preserve source/crops and exact 2.5:1',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-stitch-png-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new ProjectStore(path.join(root,'store')),images=new ImageService(),service=new StitchService(store,images),{data,info}=noisy(300,120);
 const source=await sharp(data,{raw:info}).png().toBuffer(),item=await store.import(source,'noisy.png');delete item.preview;
 const project={id:'strict-budget',name:'budget',images:[item],initialOrder:[item.id],layout:'horizontal',export:{longEdge:600,format:'png',targetBytes:1000}};await store.save(project);
 const composed=await composeProject(project,store),preview=await service.render(project,{latest:true}),exported=await service.render(await store.load(project.id)),saved=await images.save(exported.token,root);
 const meta=await sharp(saved.path).metadata();assert.equal(preview.autoResized,true);assert.deepEqual([meta.width,meta.height],[preview.width,preview.height]);assert.equal(meta.width*2,meta.height*5);assert.equal(meta.isPalette,false);assert.ok(saved.bytes<=1000);assert.equal(preview.bytes,saved.bytes);
 assert.deepEqual([preview.layout.width,preview.layout.height],[600,240]);assert.deepEqual((await store.load(project.id)).export,project.export);assert.ok((await store.readAsset(item.assetId)).equals(source));
 const expected=await sharp(composed.data,{raw:composed.info}).resize(meta.width,meta.height,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer();assert.equal(pixelDifference(expected,await sharp(saved.path).raw().toBuffer(),4).alphaMaxError,0);
 const second={...project,id:'budget-two',name:'second',export:{...project.export,targetBytes:10000}};await store.save(second);const out=await service.render(second),file=await images.save(out.token,root);assert.ok(file.bytes<=10000);assert.notEqual(file.path,saved.path);
});
