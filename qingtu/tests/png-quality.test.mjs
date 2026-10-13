import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {encodeFaithfulPng,boundedPixels,pixelDifference} from '../engine/png-quality.mjs';
function texture(width=240,height=180){const info={width,height,channels:4},data=Buffer.alloc(width*height*4);let seed=99;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;for(let c=0;c<3;c++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i+c]=100+c*20+(seed>>>28);}data[i+3]=(x+y)%256;}return {data,info};}
test('fitting lossless PNG remains small without padding and keeps every RGBA pixel',async()=>{
 const {data,info}=texture(90,60),r=await encodeFaithfulPng(data,info,1000000);assert.equal(r.lossless,true);assert.ok(r.buffer.length<100000);assert.ok((await sharp(r.buffer).raw().toBuffer()).equals(data));assert.equal(r.difference.maxError,0);
});
test('high-fidelity candidate preserves full colour, alpha, resolution and a bounded pixel error',async()=>{
 const {data,info}=texture(),full=await sharp(data,{raw:info}).png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const strongest=await sharp(boundedPixels(data,info,100),{raw:info}).png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 assert.ok(strongest.length<full.length);
 const target=Math.floor((full.length+strongest.length)/2),r=await encodeFaithfulPng(data,info,target),meta=await sharp(r.buffer).metadata();
 assert.equal(meta.isPalette,false);assert.equal(meta.width,info.width);assert.equal(meta.height,info.height);assert.equal(r.lossless,false);assert.ok(r.buffer.length<=target);assert.ok(r.buffer.length>target*.96);assert.ok(r.difference.maxError<=2);assert.equal(r.difference.alphaMaxError,0);assert.ok(r.difference.psnr>45);
 assert.deepEqual(r.difference,pixelDifference(data,await sharp(r.buffer).raw().toBuffer(),4));
});
test('smooth gradients and high-contrast text edges remain pixel-exact during bounded preprocessing',()=>{
 const info={width:256,height:40,channels:4},data=Buffer.alloc(info.width*info.height*4);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;data[i]=data[i+1]=data[i+2]=x;data[i+3]=x;}
 assert.ok(boundedPixels(data,info,100).equals(data));
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;data[i]=data[i+1]=data[i+2]=x<128?0:255;}
 assert.ok(boundedPixels(data,info,100).equals(data));
});
test('the fixed-size encoder reports its byte estimate without degrading pixels',async()=>{
 const {data,info}=texture();await assert.rejects(encodeFaithfulPng(data,info,64),error=>error.name==='PngBudgetError'&&error.faithfulBytes>64&&error.losslessBytes>=error.faithfulBytes);
});
