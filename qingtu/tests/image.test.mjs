import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { processImage, dimensions } from '../engine/image.mjs';

const noise = Buffer.alloc(480 * 320 * 3);
let seed = 17;
for (let i = 0; i < noise.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noise[i] = seed >>> 24; }
const input = () => sharp(noise, { raw: { width: 480, height: 320, channels: 3 } });
const settings = { mode: 'target', targetBytes: 16000, format: 'jpeg', resize: { type: 'scale', percent: 100, locked: true } };
const raw = b => sharp(b).raw().toBuffer({ resolveWithObject: true });

test('proportions use the last edited dimension and scale applies to each original', () => {
  assert.deepEqual(dimensions({width:3840,height:2560}, {type:'pixels',width:1920,height:99,locked:true,anchor:'width'}), {width:1920,height:1280});
  assert.deepEqual(dimensions({width:3000,height:2000}, {type:'scale',percent:50}), {width:1500,height:1000});
  assert.deepEqual(dimensions({width:400,height:200}, {type:'pixels',width:100,height:70,locked:false}), {width:100,height:70});
  assert.deepEqual(dimensions({width:400,height:200}, {type:'pixels',height:50,width:99,locked:true,anchor:'height'}), {width:100,height:50});
});
test('JPEG fits the byte ceiling and requested resolution', async () => {
  const source = await input().png().toBuffer();
  const r = await processImage(source, {...settings,resize:{type:'scale',percent:50}});
  assert.ok(r.buffer.length <= 16000);
  const m = await sharp(r.buffer).metadata();
  assert.equal(m.format,'jpeg'); assert.equal(m.width,240); assert.equal(m.height,160);
});
test('WebP meets its ceiling and explicit PNG refuses a budget that requires visible degradation', async () => {
  const source = await input().png().toBuffer();
  for (const format of ['webp']) {
    const r = await processImage(source,{...settings,format,targetBytes:25000,resize:{type:'scale',percent:50}});
    assert.ok(r.buffer.length <= 25000); assert.equal((await sharp(r.buffer).metadata()).format,format);
  }
  await assert.rejects(processImage(source,{...settings,format:'png',targetBytes:25000,resize:{type:'scale',percent:50}}),/增加上限/);
});
test('impossible target is an error rather than oversized success', async () => {
  await assert.rejects(processImage(await input().png().toBuffer(),{...settings,targetBytes:64}), /无法达到/);
});
test('PNG lossless preserves every RGBA pixel and never increases file size', async () => {
  const source = await sharp({create:{width:240,height:120,channels:4,background:{r:90,g:20,b:5,alpha:0.3}}}).png({compressionLevel:0}).toBuffer();
  const r = await processImage(source,{mode:'lossless'});
  assert.equal(r.width,240); assert.equal(r.height,120); assert.equal(r.format,'png');
  assert.ok(r.buffer.length <= source.length);
  assert.deepEqual(await raw(r.buffer),await raw(source));
});
test('WebP lossless retains decoded pixels', async () => {
  const source = await input().webp({quality:65}).toBuffer();
  const r = await processImage(source,{mode:'lossless'});
  assert.ok(r.buffer.length <= source.length); assert.deepEqual(await raw(r.buffer),await raw(source));
});
test('JPEG lossless strips comments while retaining EXIF and pixels', async () => {
  const jpeg = await input().jpeg().withMetadata({orientation:6}).toBuffer();
  const comment = Buffer.from('a comment that can safely be removed'.repeat(60));
  const header=Buffer.from([0xff,0xfe,0,0]); header.writeUInt16BE(comment.length+2,2);
  const source = Buffer.concat([jpeg.subarray(0,2),header,comment,jpeg.subarray(2)]);
  const r = await processImage(source,{mode:'lossless'});
  assert.ok(r.buffer.length < source.length); assert.equal((await sharp(r.buffer).metadata()).orientation,6);
  assert.deepEqual(await raw(r.buffer),await raw(source));
});
test('alpha stays transparent for PNG/WebP, JPEG alpha composites to white', async () => {
  const source = await sharp({create:{width:20,height:10,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  for (const format of ['webp','png','jpeg']) {
    const r=await processImage(source,{...settings,format});
    const {data,info}=await raw(r.buffer);
    if(format==='jpeg') { assert.equal(info.channels,3); assert.ok(data[0]>250); }
    else { assert.equal(info.channels,4); assert.equal(data[3],0); }
  }
});
test('target mode auto-orients an EXIF-rotated image before proportional resizing', async () => {
  const source=await input().jpeg().withMetadata({orientation:6}).toBuffer();
  const r=await processImage(source,{...settings,targetBytes:50000,resize:{type:'scale',percent:50}});
  assert.equal(r.width,160); assert.equal(r.height,240);
});
test('lossless mode reports oriented display dimensions without altering EXIF',async()=>{
  const source=await input().jpeg().withMetadata({orientation:6}).toBuffer();
  const r=await processImage(source,{mode:'lossless'});
  assert.equal(r.width,320);assert.equal(r.height,480);
});
test('PNG target retains full color if a lossless encoding fits the ceiling',async()=>{
  const source=await input().png().toBuffer();
  const r=await processImage(source,{...settings,format:'png',targetBytes:1024*1024});
  assert.ok((await raw(r.buffer)).data.equals((await raw(source)).data),'full-colour pixels should remain exact');
});
test('rejects bad inputs and invalid numeric settings', async () => {
  await assert.rejects(processImage(Buffer.from('not an image'),settings));
  await assert.rejects(processImage(await input().png().toBuffer(),{...settings,targetBytes:-1}),/目标大小/);
  assert.throws(()=>dimensions({width:480,height:320},{type:'scale',percent:0}),/缩放/);
  assert.throws(()=>dimensions({width:480,height:320},{type:'pixels',width:0,height:320,locked:false}),/尺寸/);
});
