import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';
const photo=await fs.readFile(new URL('../public/samples/alpine-lake.jpg',import.meta.url));
const settings={mode:'smart',format:'auto',exact:true,targetBytes:10*1048576,resize:{type:'scale',percent:100}};
function noise(width,height,channels=3){const data=Buffer.alloc(width*height*channels);let n=13;for(let i=0;i<data.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;data[i]=n>>>24;}return sharp(data,{raw:{width,height,channels}});}
test('a smaller unchanged source is preserved instead of inflated to the entered MB',async()=>{
 const r=await processImage(photo,settings);
 assert.equal(r.buffer.length,photo.length);assert.equal(r.format,'jpeg');assert.ok(r.buffer.equals(photo));
});
test('an unchanged PNG that fits the budget is reused byte for byte without re-encoding',async()=>{
 const source=await sharp({create:{width:120,height:80,channels:4,background:'#7799aa80'}}).png({compressionLevel:0}).toBuffer();
 const result=await processImage(source,{...settings,format:'png'});
 assert.equal(result.unchanged,true);
 assert.ok(result.buffer.equals(source));
 assert.equal(result.buffer.length,source.length);
});
test('fitting unchanged inputs bypass every raster encoder, while explicit format and size edits still apply',async()=>{
 const png=await sharp({create:{width:80,height:60,channels:3,background:'#556677'}}).png({compressionLevel:0}).toBuffer();
 const encodePng=sharp.prototype.png,encodeJpeg=sharp.prototype.jpeg;
 sharp.prototype.png=sharp.prototype.jpeg=function(){throw new Error('unnecessary raster encoder');};
 try{for(const [source,format] of [[photo,'auto'],[photo,'jpeg'],[png,'png']]){const r=await processImage(source,{...settings,format});assert.ok(r.unchanged);assert.ok(r.buffer.equals(source));}}
 finally{sharp.prototype.png=encodePng;sharp.prototype.jpeg=encodeJpeg;}
 const resized=await processImage(png,{...settings,format:'png',resize:{type:'scale',percent:50}});assert.deepEqual([resized.width,resized.height],[40,30]);
 const converted=await processImage(photo,{...settings,format:'png'});assert.equal(converted.format,'png');assert.equal(converted.unchanged,false);
});
test('a tight explicit PNG retains resolution, format and repeatable bytes',async()=>{
 const source=await noise(248,168).png({compressionLevel:0}).toBuffer();
 const attempt=()=>processImage(source,{...settings,format:'png',targetBytes:65536});
 const first=await attempt(),second=await attempt();
 assert.deepEqual(first.buffer,second.buffer);assert.ok(first.buffer.length<=65536);
 const meta=await sharp(first.buffer).metadata();assert.deepEqual([meta.width,meta.height,meta.format],[248,168,'png']);
});
test('cached PNG encodings cannot leak pixels between different source images',async()=>{
 const red=await sharp({create:{width:120,height:80,channels:3,background:'#ff0000'}}).png({compressionLevel:0}).toBuffer();
 const blue=await sharp({create:{width:120,height:80,channels:3,background:'#0000ff'}}).png({compressionLevel:0}).toBuffer();
 await processImage(red,{...settings,format:'png',targetBytes:4096});
 const result=await processImage(blue,{...settings,format:'png',targetBytes:4096});
 assert.ok(result.buffer.length<=4096);
 assert.ok((await sharp(result.buffer).raw().toBuffer()).equals(await sharp(blue).raw().toBuffer()));
});
test('changing dimensions cannot reuse the PNG from a different pixel grid',async()=>{
 const source=await noise(252,172).png({compressionLevel:0}).toBuffer();
 const full=await processImage(source,{...settings,format:'png',targetBytes:65536});assert.deepEqual([full.width,full.height],[252,172]);
 const result=await processImage(source,{...settings,format:'png',targetBytes:65536,resize:{type:'scale',percent:50}});
 const meta=await sharp(result.buffer).metadata();
 assert.equal(meta.width,126);assert.equal(meta.height,86);assert.ok(result.buffer.length<=65536);
});
test('5000 × 2140 enlargement uses the requested ceiling without a lossless size error',async()=>{
 const r=await processImage(photo,{...settings,resize:{type:'pixels',width:5000,height:2140,locked:false}});
 assert.ok(r.buffer.length<=settings.targetBytes);assert.equal(r.paddedBytes,0);assert.equal(r.format,'jpeg');assert.equal(r.width,5000);assert.equal(r.height,2140);
 const meta=await sharp(r.buffer).metadata();assert.equal(meta.width,5000);assert.equal(meta.height,2140);
});
test('a larger image stays under the entered byte ceiling without changing requested pixels',async()=>{
 const source=await noise(768,512).png({compressionLevel:0}).toBuffer();
 const r=await processImage(source,{...settings,targetBytes:262144});
 assert.ok(r.buffer.length<=262144);assert.ok(r.buffer.length>=262144*0.97);assert.equal(r.width,768);assert.equal(r.height,512);assert.equal(r.format,'jpeg');
 await sharp(r.buffer).raw().toBuffer();
});
test('explicit JPG outputs a real JPEG without padding the encoded file',async()=>{
 const source=await noise(120,80).png({compressionLevel:0}).toBuffer();
 const r=await processImage(source,{...settings,format:'jpeg',resize:{type:'scale',percent:50}});
 assert.ok(r.buffer.length<=settings.targetBytes);assert.equal(r.paddedBytes,0);assert.equal((await sharp(r.buffer).metadata()).format,'jpeg');assert.equal(r.width,60);
});
test('PNG preserves resized transparency and pixels when lossless output fits',async()=>{
 const source=await noise(80,60,4).png({compressionLevel:0}).toBuffer();
 const r=await processImage(source,{...settings,format:'png',resize:{type:'scale',percent:50}});
 assert.ok(r.buffer.length<=settings.targetBytes);assert.equal(r.paddedBytes,0);assert.equal(r.format,'png');
 const expected=await sharp(source).resize(40,30).raw().toBuffer();assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(expected));
});
test('automatic output converts WebP input into JPG or PNG',async()=>{
 const source=await noise(120,80).webp({lossless:true}).toBuffer();
 const r=await processImage(source,settings);
 assert.ok(r.buffer.length<=settings.targetBytes);assert.equal(r.paddedBytes,0);assert.ok(['jpeg','png'].includes(r.format));
});
test('invalid smart targets and infeasible byte budgets still fail clearly',async()=>{
 await assert.rejects(processImage(photo,{...settings,targetBytes:0}),/目标大小/);
 await assert.rejects(processImage(photo,{...settings,targetBytes:undefined}),/目标大小/);
 await assert.rejects(processImage(photo,{...settings,targetBytes:64}),/当前尺寸无法达到/);
});

test('smart exports use only encoded image bytes, even when old clients request exact padding',async()=>{
 const source=await noise(280,180).png({compressionLevel:0}).toBuffer();
 const r=await processImage(source,{...settings,format:'jpeg',targetBytes:25000});
 assert.ok(r.buffer.length<=25000);
 assert.equal(r.paddedBytes,0);
 assert.equal(r.imageBytes,r.buffer.length);
});
test('resizing a small source can use the entered budget and retain full-colour PNG pixels',async()=>{
 const source=await noise(90,60).jpeg({quality:30}).toBuffer();
 const r=await processImage(source,{...settings,format:'png',targetBytes:1000000,resize:{type:'scale',percent:200}});
 assert.equal(r.limitBytes,1000000);
 assert.equal(r.lossless,true);
 assert.equal(r.paddedBytes,0);
 assert.ok(r.buffer.length>source.length && r.buffer.length<=1000000);
 const expected=await sharp(source).rotate().resize(180,120,{fit:'fill'}).toColourspace('srgb').raw().toBuffer();
 assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(expected));
});

test('a compressed JPG uses the highest fitting whole-number quality',async()=>{
 const source=await noise(280,184).png({compressionLevel:0}).toBuffer();
 const r=await processImage(source,{...settings,format:'jpeg',targetBytes:30000});
 assert.ok(r.buffer.length<=30000 && r.buffer.length>=29000);
 assert.ok(r.quality<100);
 const next=await sharp(source).rotate().resize(280,184,{fit:'fill'}).toColourspace('srgb').flatten({background:'#fff'}).jpeg({quality:r.quality+1,chromaSubsampling:r.chromaSubsampling,mozjpeg:r.mozjpeg,optimiseCoding:true}).toBuffer();
 assert.ok(next.length>30000,'the next quality must exceed the budget');
});
