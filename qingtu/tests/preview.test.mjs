import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {ImageService} from '../engine/service.mjs';
const photo=await fs.readFile(new URL('../public/samples/alpine-lake.jpg',import.meta.url));
const decode=url=>Buffer.from(url.split(',')[1],'base64');
const config={mode:'smart',exact:true,format:'jpeg',targetBytes:10485760,resize:{type:'scale',percent:100}};
test('unchanged exports legitimately retain the same original preview',async()=>{
 const s=new ImageService(),file=await s.add(photo,'photo.jpg');
 const result=await s.process(file.id,config);
 assert.equal(result.unchanged,true);assert.equal(result.preview,file.preview);assert.ok(s.result(result.token).output.buffer.equals(photo));
});
test('an enlarged output uses the original preview sampling bounds',async()=>{
 const s=new ImageService(),file=await s.add(photo,'photo.jpg');
 const result=await s.process(file.id,{...config,resize:{type:'pixels',width:5000,height:2140,locked:false}});
 const original=await sharp(decode(file.preview)).metadata(),processed=await sharp(decode(result.preview)).metadata();
 assert.equal(original.width,1536);assert.equal(original.height,1024);
 assert.equal(processed.width,1536);assert.equal(processed.height,657);
});
test('compressed preview pixels are decoded from the real exported result',async()=>{
 const s=new ImageService(),file=await s.add(photo,'photo.jpg');
 const result=await s.process(file.id,{...config,targetBytes:131072});
 assert.notEqual(result.preview,file.preview);
 const actual=await sharp(decode(result.preview)).raw().toBuffer();
 const exported=await sharp(s.result(result.token).output.buffer).rotate().raw().toBuffer();
 assert.ok(actual.equals(exported));
});
test('an unchanged portrait keeps the exact original preview even at fractional resize bounds',async()=>{
 const photo=await sharp({create:{width:1200,height:1601,channels:3,background:'#7799aa'}}).jpeg().toBuffer();
 const s=new ImageService(),file=await s.add(photo,'portrait.jpg');
 const result=await s.process(file.id,config);
 assert.equal(result.unchanged,true);
 assert.equal(result.preview===file.preview,true);
});
