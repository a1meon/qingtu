import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ProjectStore} from '../engine/project-store.mjs';
import {ImageService} from '../engine/service.mjs';
import {StitchService} from '../engine/stitch-service.mjs';
import {moveImage} from '../engine/stitch-layout.mjs';
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-stitch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(path.join(root,'store')),images=new ImageService();return {root,store,images,service:new StitchService(store,images)};}
const settings={longEdge:120,format:'png',targetBytes:1000000};
async function solid(store,name,width,height,color){const source=await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer();const item=await store.import(source,name);delete item.preview;return item;}
test('real 4K example exports rectangular transparent PNG with zero padding and correct pixel boundaries',async t=>{
 const {store,images,service}=await setup(t);
 const files=[];for(const [name,w,h,color] of [['a',3072,4096,'#ff0000'],['b',3072,4096,'#00ff00'],['c',2160,3840,'#0000ff'],['d',2160,3840,'#ffff0080']])files.push(await solid(store,name,w,h,color));
 const project={id:'four-portraits',name:'四张4K',images:files,layout:'horizontal',export:{...settings,longEdge:5999}};
 const result=await service.render(project),output=images.result(result.token).output,meta=await sharp(output.buffer).metadata();
 assert.deepEqual([meta.width,meta.height],[5999,2400]);assert.equal(meta.format,'png');assert.ok(output.buffer.length<=1000000);assert.equal(output.paddedBytes,0);
 const {data,info}=await sharp(output.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)];
 assert.deepEqual(pixel(0,0),[255,0,0,255]);assert.deepEqual(pixel(1799,2399),[255,0,0,255]);assert.deepEqual(pixel(1800,0),[0,255,0,255]);assert.deepEqual(pixel(3600,0),[0,0,255,255]);
 assert.equal(pixel(5998,2399)[3],128,'last corner preserves transparency rather than a rounded mask');
 assert.deepEqual(files.map(f=>[f.width,f.height]),[[3072,4096],[3072,4096],[2160,3840],[2160,3840]]);
});
test('separate and batch exports use their own formats, resolutions and actual byte ceilings',async t=>{
 const {root,store,images,service}=await setup(t),red=await solid(store,'red',80,80,'#ff000080'),blue=await solid(store,'blue',80,80,'#0000ff');
 const projects=[{id:'one',name:'one',images:[red,blue],layout:'horizontal',export:settings},{id:'two',name:'two',images:[red],layout:'vertical',export:{...settings,longEdge:80,format:'jpeg'}}];
 const paths=[];for(const p of projects){await store.save(p);const r=await service.render(await store.load(p.id),null);paths.push(await images.save(r.token,root));}
 assert.notEqual(paths[0].path,paths[1].path);
 for(let n=0;n<paths.length;n++){const meta=await sharp(paths[n].path).metadata();assert.equal(meta.format,n===0?'png':'jpeg');assert.equal(Math.max(meta.width,meta.height),projects[n].export.longEdge);assert.equal((await fs.stat(paths[n].path)).size,paths[n].bytes);assert.ok(paths[n].bytes<=projects[n].export.targetBytes);}
 const corner=await sharp(paths[1].path).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.ok(corner[1]>110&&corner[2]>110,'JPEG flattens transparent red onto white');
});
test('newer previews discard queued old previews but never discard a true export',async t=>{
 const {store,images,service}=await setup(t),item=await solid(store,'one',60,60,'#6688aa');
 const project={id:'project',images:[item],layout:'horizontal',export:settings};
 const first=service.render(project,{latest:true}),exported=service.render(project),obsolete=service.render({...project,export:{...settings,longEdge:80}},{latest:true}),newest=service.render({...project,export:{...settings,longEdge:90}},{latest:true});
 await assert.rejects(first,/预览参数/);await assert.rejects(obsolete,/预览参数/);const result=await exported;assert.ok(images.result(result.token));assert.equal((await newest).width,90);assert.ok(images.result(result.token),'new preview must not invalidate export token');
});
test('free internal gaps are transparent and image ordering controls actual overlap pixels',async t=>{
 const {store,images,service}=await setup(t),red=await solid(store,'red',100,100,'#ff0000'),blue=await solid(store,'blue',100,100,'#0000ff');
 const p={id:'free-project',images:[red,blue],layout:'free',positions:{[red.id]:{x:-20,y:-30,width:50},[blue.id]:{x:80,y:20,width:100}},export:{...settings,longEdge:200}};
 let result=await service.render(p),data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();
 const pixel=(x,y)=>[...data.subarray((y*200+x)*4,(y*200+x)*4+4)];assert.deepEqual(pixel(0,0),[255,0,0,255]);assert.equal(pixel(199,0)[3],0);assert.deepEqual(pixel(199,149),[0,0,255,255]);
 p.positions[blue.id]={x:0,y:0,width:100};p.positions[red.id]={x:0,y:0,width:100};result=await service.render(p);data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([...data.subarray(0,4)],[0,0,255,255]);
 result=await service.render({...p,images:[blue,red]});data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([...data.subarray(0,4)],[255,0,0,255]);
});
test('grid composes mixed aspect ratios into completely filled rows without automatic crop',async t=>{
 const {store,images,service}=await setup(t),items=[await solid(store,'a',60,80,'#ff0000'),await solid(store,'b',45,80,'#00ff00'),await solid(store,'c',90,60,'#0000ff')];
 const p={id:'grid-project',images:items,layout:'grid',grid:{rows:2,columns:2},export:settings},r=await service.render(p),{data}=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.ok(r.layout.rects.every(i=>i.crop===null));for(let i=3;i<data.length;i+=4)assert.equal(data[i],255,'no hidden transparent grid cells or gaps');
});
test('actual manual crops keep exact centre source pixels, alpha and original copies',async t=>{
 const {store,images,service}=await setup(t),width=120,height=100,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x;data[i+1]=y;data[i+2]=(x*3+y*5)%256;data[i+3]=255;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),item=await store.import(source,'pixel-pattern.png');delete item.preview;
 for(const [axis,amount,longEdge] of [['horizontal',10,100],['vertical',20,120]]){
  const p={id:'manual-'+axis,images:[item],layout:'horizontal',edits:{[item.id]:{axis,amount}},export:{...settings,longEdge}};
  await store.save(p);const restored=await store.load(p.id),r=await service.render(restored),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
  const expected=await sharp(source).extract(axis==='horizontal'?{left:10,top:0,width:100,height:100}:{left:0,top:20,width:120,height:60}).ensureAlpha().raw().toBuffer();
  assert.ok(actual.equals(expected));assert.ok((await store.readAsset(item.assetId)).equals(source));assert.deepEqual(restored.edits,p.edits);
 }
});
test('automatic layout reorder changes saved order and actual export colours',async t=>{
 const {store,images,service}=await setup(t),red=await solid(store,'red',60,90,'#ff0000'),green=await solid(store,'green',60,90,'#00ff00'),blue=await solid(store,'blue',60,90,'#0000ff');
 const p={id:'reordered',images:moveImage([red,green,blue],red.id,blue.id),layout:'horizontal',export:{...settings,longEdge:180}};await store.save(p);
 const restored=await store.load(p.id),r=await service.render(restored),raw=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
 assert.deepEqual(restored.images.map(i=>i.id),[green.id,blue.id,red.id]);
 for(const [x,color] of [[0,[0,255,0,255]],[60,[0,0,255,255]],[120,[255,0,0,255]]])assert.deepEqual([...raw.subarray(x*4,x*4+4)],color);
});
test('manual crop coordinates follow EXIF-oriented display pixels rather than encoded file axes',async t=>{
 const {store,images,service}=await setup(t),source=await sharp({create:{width:90,height:60,channels:3,background:'#aa5544'}}).composite([{input:await sharp({create:{width:30,height:60,channels:3,background:'#3366aa'}}).png().toBuffer(),left:0,top:0}]).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
 const item=await store.import(source,'rotated.jpg');delete item.preview;assert.deepEqual([item.width,item.height],[60,90]);
 const p={id:'exif-crop',images:[item],layout:'horizontal',edits:{[item.id]:{axis:'horizontal',amount:5}},export:{...settings,longEdge:90}},r=await service.render(p),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
 const expected=await sharp(source).rotate().extract({left:5,top:0,width:50,height:90}).ensureAlpha().raw().toBuffer();assert.deepEqual([r.width,r.height],[50,90]);assert.ok(actual.equals(expected));
});
