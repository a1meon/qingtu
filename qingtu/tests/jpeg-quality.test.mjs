import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {encodeJpeg} from '../engine/jpeg-quality.mjs';
import {pixelDifference} from '../engine/png-quality.mjs';

test('fitting JPEG preserves one-pixel coloured edges without chroma subsampling',async()=>{
 const info={width:128,height:80,channels:3},data=Buffer.alloc(info.width*info.height*3);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;data[i]=x%2?255:0;data[i+1]=0;data[i+2]=x%2?0:255;}
 const r=await encodeJpeg(data,info,1000000),actual=pixelDifference(data,await sharp(r.buffer).raw().toBuffer(),3);
 const old=await sharp(data,{raw:info}).jpeg({quality:100,mozjpeg:true}).toBuffer(),difference=pixelDifference(data,await sharp(old).raw().toBuffer(),3);
 assert.equal(r.chromaSubsampling,'4:4:4');assert.equal(r.quality,100);assert.ok(actual.rmse<2);assert.ok(actual.rmse<difference.rmse/20);assert.deepEqual([(await sharp(r.buffer).metadata()).width,(await sharp(r.buffer).metadata()).height],[128,80]);
});
test('tight JPEG budget compares decoded candidates and uses the highest fitting quality of the chosen encoding',async()=>{
 const source=await fs.readFile(new URL('../public/samples/alpine-lake.jpg',import.meta.url)),{data,info}=await sharp(source).raw().toBuffer({resolveWithObject:true}),r=await encodeJpeg(data,info,400000);
 assert.ok(r.buffer.length<=400000);assert.equal(r.difference.alphaMaxError,0);assert.deepEqual(r.difference,pixelDifference(data,await sharp(r.buffer).raw().toBuffer(),info.channels));
 const next=await sharp(data,{raw:info}).jpeg({quality:r.quality+1,chromaSubsampling:r.chromaSubsampling,mozjpeg:r.mozjpeg,optimiseCoding:true}).toBuffer();assert.ok(next.length>400000);
 await assert.rejects(encodeJpeg(data,info,64),/增加大小上限/);
});
