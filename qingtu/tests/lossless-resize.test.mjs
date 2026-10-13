import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';

const source=await sharp({create:{width:120,height:80,channels:4,background:{r:120,g:80,b:50,alpha:0.4}}}).png().toBuffer();
const settings={mode:'lossless',format:'auto',exact:true,targetBytes:1048576,resize:{type:'pixels',width:60,height:40,locked:true,anchor:'width'}};
test('default lossless workflow accepts pixel dimensions and encodes resized RGBA pixels losslessly',async()=>{
 const r=await processImage(source,settings);
 assert.equal(r.width,60);assert.equal(r.height,40);assert.equal(r.format,'png');assert.equal(r.buffer.length,1048576);
 const expected=await sharp(source).resize(60,40,{fit:'fill'}).raw().toBuffer();
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(expected));
});
test('JPEG resized in automatic lossless workflow becomes PNG without lossy re-encoding',async()=>{
 const jpeg=await sharp(source).flatten({background:'#fff'}).jpeg().toBuffer();
 const r=await processImage(jpeg,settings);
 assert.equal(r.format,'png');assert.equal(r.width,60);
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(jpeg).resize(60,40,{fit:'fill'}).raw().toBuffer()));
});
test('unchanged automatic workflow retains JPEG original dimensions and pixels',async()=>{
 const jpeg=await sharp(source).flatten({background:'#fff'}).jpeg().toBuffer();
 const r=await processImage(jpeg,{...settings,resize:{type:'scale',percent:100}});
 assert.equal(r.width,120);assert.equal(r.height,80);assert.equal(r.format,'jpeg');
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(await sharp(jpeg).raw().toBuffer()));
});
test('lossless resized WebP preserves pixels and correctly normalizes EXIF rotation',async()=>{
 const jpeg=await sharp(source).flatten({background:'#fff'}).jpeg().withMetadata({orientation:6}).toBuffer();
 const r=await processImage(jpeg,{...settings,format:'webp',resize:{type:'scale',percent:50}});
 assert.equal(r.format,'webp');assert.equal(r.width,40);assert.equal(r.height,60);
 assert.ok((await sharp(r.buffer).rotate().raw().toBuffer()).equals(await sharp(jpeg).rotate().resize(40,60,{fit:'fill'}).raw().toBuffer()));
});
test('an impossible lossless resize byte limit is reported without silently changing quality',async()=>{
 await assert.rejects(processImage(source,{...settings,targetBytes:64}),/无法无损/);
});
