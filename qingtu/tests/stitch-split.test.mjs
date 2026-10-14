import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {splitProjectImage} from '../engine/stitch-split.mjs';
import {imageGeometry,cropFractions,setImageEdit} from '../engine/stitch-edits.mjs';
import {sourceWindow,originalBytes} from '../engine/image-source.mjs';
import {ProjectStore} from '../engine/project-store.mjs';
import {ImageService} from '../engine/service.mjs';
import {StitchService} from '../engine/stitch-service.mjs';
const image={id:'image',assetId:'a'.repeat(64),name:'original.png',width:120,height:100,bytes:300000000};
const project=()=>({id:'split-project',canvasMode:'fixed',canvas:{width:120,height:100},images:[image],initialOrder:['image'],positions:{image:{x:0,y:0,width:120,height:100}},edits:{},layout:'free',export:{format:'png',targetBytes:1000000}});

test('source windows split on each axis at exact original pixels and share the immutable asset',()=>{
 for(const axis of ['x','y']){
  const p=project(),next=splitProjectImage(p,'image',axis,40,['first','second']);
  assert.deepEqual(next.images.map(i=>i.assetId),[image.assetId,image.assetId]);assert.equal(originalBytes(next.images),image.bytes);assert.deepEqual(next.initialOrder,['first','second']);assert.deepEqual(next.canvas,p.canvas);assert.equal(p.images.length,1);
  assert.equal(next.images[0][axis==='x'?'width':'height'],40);assert.equal(next.images[1][axis==='x'?'width':'height'],axis==='x'?80:60);
  assert.equal(next.positions.second[axis==='x'?'x':'y'],40);assert.equal(next.positions.first[axis==='x'?'width':'height']+next.positions.second[axis==='x'?'width':'height'],axis==='x'?120:100);
 }
});
test('split ignores manual crops and can restore the full source scale and centre without stretching',()=>{
 const p=setImageEdit(project(),'image',{axis:'horizontal',amount:10}),next=splitProjectImage(p,'image','x',60,['first','second']);
 assert.deepEqual(next.positions.first,{x:0,y:0,width:60,height:100});assert.deepEqual(next.positions.second,{x:60,y:0,width:60,height:100});assert.deepEqual(next.edits,{});assert.equal(next.images[0].width,60);
});
test('a repeated split operates on the complete current piece and keeps its absolute source window',()=>{
 const first=splitProjectImage(project(),'image','x',40,['left','right']),next=splitProjectImage(first,'right','y',30,['top','bottom']);
 assert.deepEqual(sourceWindow(next.images[1]),{left:40,top:0,width:80,height:30,fullWidth:120,fullHeight:100});assert.deepEqual(sourceWindow(next.images[2]),{left:40,top:30,width:80,height:70,fullWidth:120,fullHeight:100});
 assert.deepEqual(next.initialOrder,['left','top','bottom']);assert.equal(originalBytes(next.images),image.bytes);
 const cropped=setImageEdit(next,'bottom',{axis:'horizontal',amount:10}),piece=cropped.images[2],fractions=cropFractions(piece,imageGeometry(piece,cropped.edits.bottom));assert.ok(Math.abs(fractions.left-50/120)<1e-12);assert.ok(Math.abs(fractions.right-10/120)<1e-12);assert.equal(fractions.top,.3);
});
test('invalid boundaries, duplicate identities and out-of-asset windows fail without modifying the project',()=>{
 const p=project();for(const at of [0,120,-1,1.2])assert.throws(()=>splitProjectImage(p,'image','x',at,['a','b']),/分割线/);
 assert.throws(()=>splitProjectImage(p,'image','x',50,['image','b']),/标识/);assert.equal(p.images.length,1);
 assert.throws(()=>sourceWindow({...image,source:{left:1,top:0,width:120,height:100,fullWidth:120,fullHeight:100}}),/原图区域/);
});
test('split export has identical pixels before and after split, survives recovery and retains one original copy',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-split-'));t.after(async()=>{if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('qingtu-split-'))throw new Error('Unsafe cleanup');await fs.rm(root,{recursive:true,force:true});});
 const data=Buffer.alloc(120*100*4);for(let y=0;y<100;y++)for(let x=0;x<120;x++){const i=(y*120+x)*4;data[i]=x*2;data[i+1]=y*2;data[i+2]=190;data[i+3]=x<60?255:128;}
 const store=new ProjectStore(root),images=new ImageService(),service=new StitchService(store,images),source=await sharp(data,{raw:{width:120,height:100,channels:4}}).png().toBuffer(),item=await store.import(source,'pattern.png');delete item.preview;
 const p={...project(),images:[item],initialOrder:[item.id],positions:{[item.id]:project().positions.image}},before=await service.render(p),pixels=await sharp(images.result(before.token).output.buffer).raw().toBuffer();
 for(const axis of ['x','y']){
  const split=splitProjectImage(p,item.id,axis,37,['first','second']);await store.save(split);const reopened=await new ProjectStore(root).load(p.id),r=await service.render(reopened),actual=await sharp(images.result(r.token).output.buffer).raw().toBuffer();assert.ok(actual.equals(pixels));assert.equal((await fs.readdir(path.join(root,'assets'))).length,1);assert.ok((await store.readAsset(item.assetId)).equals(source));
 }
});
test('EXIF-oriented splits use display coordinates and preserve oriented source pixels',async()=>{
 const source=await sharp({create:{width:120,height:80,channels:3,background:'#447799'}}).composite([{input:await sharp({create:{width:30,height:80,channels:3,background:'#cc9933'}}).png().toBuffer(),left:0,top:0}]).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
 const item={id:'original',assetId:'b'.repeat(64),width:80,height:120,bytes:source.length},p={...project(),canvas:{width:80,height:120},images:[item],initialOrder:[item.id],positions:{original:{x:0,y:0,width:80,height:120}}},images=new ImageService(),service=new StitchService({validate:()=>{},readAsset:async()=>source},images);
 const before=await service.render(p),split=splitProjectImage(p,item.id,'y',31,['top','bottom']),after=await service.render(split),pixels=await sharp(images.result(before.token).output.buffer).raw().toBuffer(),actual=await sharp(images.result(after.token).output.buffer).raw().toBuffer();assert.ok(actual.equals(pixels));assert.equal(split.images[1].source.top,31);
});
