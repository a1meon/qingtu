import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';

const source=await sharp({create:{width:120,height:80,channels:4,background:{r:110,g:88,b:44,alpha:0.4}}}).png().toBuffer();
const settings={mode:'target',format:'jpeg',targetBytes:1048576,resize:{type:'scale',percent:100},exact:true};
for(const format of ['jpeg','png','webp'])test(`${format} ignores legacy padding flags and retains decodable pixels under the actual ceiling`,async()=>{
 const r=await processImage(source,{...settings,format});
 assert.ok(r.buffer.length<1048576);assert.equal(r.paddedBytes,0);assert.equal((await sharp(r.buffer).metadata()).width,120);
 const unpadded=await processImage(source,{...settings,format,exact:false});
 assert.ok(r.buffer.equals(unpadded.buffer));
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(unpadded.buffer).raw().toBuffer()));
});
test('lossless keeps small output without adding neutral bytes and rejects an impossible smaller limit',async()=>{
 const r=await processImage(source,{mode:'lossless',targetBytes:1048576,exact:true});
 assert.ok(r.buffer.length<1048576);assert.equal(r.paddedBytes,0);assert.equal(r.format,'png');
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(source).raw().toBuffer()));
 await assert.rejects(processImage(source,{mode:'lossless',targetBytes:64,exact:true}),/无法无损/);
});
test('lossless JPEG preserves EXIF and every decoded pixel without filling its budget',async()=>{
 const jpeg=await sharp(source).jpeg().withMetadata({orientation:6}).toBuffer();
 const r=await processImage(jpeg,{mode:'lossless',targetBytes:1048576,exact:true});
 assert.ok(r.buffer.length<1048576);assert.equal(r.paddedBytes,0);assert.equal((await sharp(r.buffer).metadata()).orientation,6);
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(jpeg).raw().toBuffer()));
});
test('arbitrary byte ceilings and tiny remaining gaps never inflate already fitting encoded images',async()=>{
 for(const format of ['jpeg','png','webp']){
  const unpadded=await processImage(source,{...settings,format,exact:false});
  for(const delta of [0,1,2,3,7,8,11,12,13,65538]){
   const targetBytes=unpadded.buffer.length+delta;
   const r=await processImage(source,{...settings,format,targetBytes});
   assert.ok(r.buffer.length<=targetBytes);assert.equal(r.paddedBytes,0);assert.ok(r.buffer.equals(unpadded.buffer));
   assert.equal((await sharp(r.buffer).metadata()).height,80);
  }
 }
});
