import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';

const source=await sharp({create:{width:120,height:80,channels:4,background:{r:110,g:88,b:44,alpha:0.4}}}).png().toBuffer();
const settings={mode:'target',format:'jpeg',targetBytes:1048576,resize:{type:'scale',percent:100},exact:true};
for(const format of ['jpeg','png','webp'])test(`${format} reaches exact integer-byte MB size and retains decodable pixels`,async()=>{
 const r=await processImage(source,{...settings,format});
 assert.equal(r.buffer.length,1048576);assert.equal((await sharp(r.buffer).metadata()).width,120);
 const unpadded=await processImage(source,{...settings,format,exact:false});
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(unpadded.buffer).raw().toBuffer()));
});
test('lossless accepts byte target, pads without changing RGBA pixels, and rejects an impossible smaller limit',async()=>{
 const r=await processImage(source,{mode:'lossless',targetBytes:1048576,exact:true});
 assert.equal(r.buffer.length,1048576);assert.equal(r.format,'png');
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(source).raw().toBuffer()));
 await assert.rejects(processImage(source,{mode:'lossless',targetBytes:64,exact:true}),/无法无损/);
});
test('lossless JPEG with an exact ceiling preserves EXIF and every decoded pixel',async()=>{
 const jpeg=await sharp(source).jpeg().withMetadata({orientation:6}).toBuffer();
 const r=await processImage(jpeg,{mode:'lossless',targetBytes:1048576,exact:true});
 assert.equal(r.buffer.length,1048576);assert.equal((await sharp(r.buffer).metadata()).orientation,6);
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(jpeg).raw().toBuffer()));
});
test('exact arbitrary rounded byte sizes and tiny padding gaps remain decodable',async()=>{
 for(const format of ['jpeg','png','webp']){
  const unpadded=await processImage(source,{...settings,format,exact:false});
  for(const delta of [0,1,2,3,7,8,11,12,13,65538]){
   const targetBytes=unpadded.buffer.length+delta;
   const r=await processImage(source,{...settings,format,targetBytes});
   assert.equal(r.buffer.length,targetBytes);
   assert.equal((await sharp(r.buffer).metadata()).height,80);
  }
 }
});
