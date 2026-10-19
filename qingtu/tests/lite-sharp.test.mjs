import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import lite from '../src/lite/sharp.mjs';
const rgba=Buffer.from(Array.from({length:21*13*4},(_,i)=>(i*37)%256));
const raw={width:21,height:13,channels:4};
test('lightweight libvips keeps full-colour transparent PNG pixels',async()=>{
 const output=await lite(rgba,{raw}).png().toBuffer();
 const decoded=await sharp(output).raw().toBuffer({resolveWithObject:true});
 assert.equal(decoded.info.width,21);assert.equal(decoded.info.channels,4);assert.deepEqual(decoded.data,rgba);
 const meta=await lite(output).metadata();assert.equal(meta.format,'png');assert.equal(meta.depth,'uchar');assert.equal(meta.hasAlpha,true);
});
test('lightweight transforms preserve crop, quarter-turn, alpha and dimensions',async()=>{
 for(const factory of [sharp,lite]){
  const output=await factory(rgba,{raw}).rotate(90).extract({left:2,top:3,width:7,height:11}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const expected=await sharp(rgba,{raw}).rotate(90).extract({left:2,top:3,width:7,height:11}).raw().toBuffer();
  assert.deepEqual(output.data,expected);assert.equal(output.info.width,7);assert.equal(output.info.height,11);
 }
});
test('lightweight PNG resize and arbitrary rotation agree with native export dimensions',async()=>{
 const outputs=[];for(const factory of [sharp,lite])outputs.push(await factory(rgba,{raw}).resize(42,26,{fit:'fill'}).rotate(13.7,{background:'#00000000'}).png().toBuffer());
 const metas=await Promise.all(outputs.map(b=>sharp(b).metadata()));assert.equal(metas[0].width,metas[1].width);assert.equal(metas[0].height,metas[1].height);
});
test('lightweight JPEG encoder and alpha compositing produce actual decodable exports',async()=>{
 const result=await lite(Buffer.alloc(40*30*4),{raw:{width:40,height:30,channels:4}}).composite([{input:rgba,raw,left:3,top:5}]).flatten({background:'#fff'}).jpeg({quality:91,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
 const meta=await sharp(result).metadata();assert.equal(meta.width,40);assert.equal(meta.height,30);assert.equal(meta.format,'jpeg');
});
test('lightweight processing converts embedded Display-P3 colours to sRGB like Sharp',async()=>{
 const source=await sharp(Buffer.from([200,80,50]),{raw:{width:1,height:1,channels:3}}).withIccProfile('p3').png().toBuffer();
 const expected=await sharp(source).rotate().toColourspace('srgb').raw().toBuffer();
 const actual=await lite(source).rotate().toColourspace('srgb').raw().toBuffer();assert.deepEqual(actual,expected);
});
