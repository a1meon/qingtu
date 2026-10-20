import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ImageService } from '../engine/service.mjs';

const config={mode:'target',targetBytes:10000,format:'jpeg',resize:{type:'scale',percent:50}};
test('failed file saves release export buffers while retaining the reusable preview',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-save-failure-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const service=new ImageService(),source=await sharp({create:{width:80,height:60,channels:3,background:'#99bbaa'}}).png().toBuffer(),file=await service.add(source,'photo.png');
 const result=await service.process(file.id,config);
 await assert.rejects(service.save(result.token,path.join(root,'missing')),/ENOENT/);
 assert.throws(()=>service.result(result.token),/失效/);
 const preview=await service.process(file.id,config,{latest:true});assert.ok(service.result(preview.token));
 const retry=await service.process(file.id,config),saved=await service.save(retry.token,root);assert.ok(saved.bytes<=10000);
 assert.throws(()=>service.result(retry.token),/失效/);assert.ok(service.result(preview.token));
});
test('service imports real files, writes exclusive output names, and releases removed entries',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-test-'));
  try {
    const buffer=await sharp({create:{width:80,height:60,channels:3,background:'#669988'}}).png().toBuffer();
    const s=new ImageService();
    const file=await s.add(buffer,'../photo.png');
    assert.equal(file.name,'photo.png');assert.equal(file.width,80);
    const result=await s.process(file.id,config);
    assert.ok(result.bytes<=10000);assert.equal(result.width,40);
    await fs.writeFile(path.join(dir,'photo-qingtu.jpg'),'existing');
    const saved=await s.save(result.token,dir);
    assert.equal(path.basename(saved.path),'photo-qingtu-2.jpg');
    assert.equal(await fs.readFile(path.join(dir,'photo-qingtu.jpg'),'utf8'),'existing');
    assert.equal((await sharp(saved.path).metadata()).height,30);
    s.remove(file.id);
    await assert.rejects(s.process(file.id,config),/已移除/);
    await assert.rejects(s.save(result.token,dir),/失效/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('rejects invalid imports, unknown tokens and animation, while retaining valid imports',async()=>{
  const s=new ImageService();
  await assert.rejects(s.add(Buffer.from('bad'),'bad.png'));
  await assert.rejects(s.save('arbitrary','/tmp'),/失效/);
  assert.throws(()=>s.original('arbitrary'),/已移除/);
});
test('concurrent exports serialize per file and preserve each independent export token',async()=>{
 const s=new ImageService();
 const b=await sharp({create:{width:100,height:80,channels:3,background:'#778899'}}).png().toBuffer();
 const file=await s.add(b,'test.png');
 const promises=[s.process(file.id,{...config,format:'png'}),s.process(file.id,config),s.process(file.id,{...config,format:'webp'})];
 const results=await Promise.all(promises);
 assert.equal(s.result(results[2].token).output.format,'webp');
 assert.equal(s.result(results[0].token).output.format,'png');assert.equal(s.result(results[1].token).output.format,'jpeg');assert.equal(s.results.size,4,'three pinned exports plus one bounded preview cache');
});
test('queued live previews skip obsolete settings while retaining the newest request',async()=>{
 const service=new ImageService();
 const source=await sharp({create:{width:30,height:20,channels:3,background:'#7799aa'}}).jpeg().toBuffer();
 const file=await service.add(source,'photo.jpg');
 const base={mode:'smart',format:'auto',exact:true,resize:{type:'scale',percent:100}};
 const results=await Promise.allSettled([1,2,3].map(n=>service.process(file.id,{...base,targetBytes:n*1048576},{latest:true})));
 assert.deepEqual(results.map(result=>result.status),['rejected','rejected','fulfilled']);
 assert.match(results[0].reason.message,/预览.*更新/);
 assert.equal(service.result(results[2].value.token).output.buffer.equals(source),true);
});
test('a queued export is never discarded by newer live preview settings',async()=>{
 const service=new ImageService();
 const source=await sharp({create:{width:30,height:20,channels:3,background:'#7799aa'}}).jpeg().toBuffer();
 const file=await service.add(source,'photo.jpg');
 const base={mode:'smart',format:'auto',exact:true,targetBytes:1048576,resize:{type:'scale',percent:100}};
 const results=await Promise.allSettled([
  service.process(file.id,base,{latest:true}),
  service.process(file.id,{...base,format:'png',resize:{type:'scale',percent:50}}),
  service.process(file.id,{...base,targetBytes:2097152},{latest:true})
 ]);
 assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled','fulfilled']);
 assert.equal(results[1].value.width,15);assert.equal(results[1].value.height,10);assert.equal(results[1].value.format,'png');
 assert.equal(service.result(results[1].value.token).output.format,'png','later previews must retain export bytes until actual save');
});
test('an in-flight obsolete preview stops at its encoding boundary while a true export remains queued and completes',async()=>{
 const service=new ImageService(),data=Buffer.alloc(52*34*3);let seed=333;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
 const source=await sharp(data,{raw:{width:52,height:34,channels:3}}).png({compressionLevel:0}).toBuffer(),file=await service.add(source,'in-flight.png');
 let enter,release,signalled=false,encodes=0;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),png=sharp.prototype.png;
 sharp.prototype.png=function(options){const pipeline=png.call(this,options),toBuffer=pipeline.toBuffer;pipeline.toBuffer=async function(...args){if(options?.compressionLevel===9){encodes++;if(!signalled){signalled=true;enter();await gate;}}return toBuffer.apply(this,args);};return pipeline;};
 const settings={mode:'smart',format:'png',resize:{type:'scale',percent:100},targetBytes:64};
 try{
  const old=service.process(file.id,settings,{latest:true}),oldResult=Promise.allSettled([old]);await entered;
  const exported=service.process(file.id,{...settings,format:'jpeg',targetBytes:1000000}),newest=service.process(file.id,{...settings,targetBytes:1000000},{latest:true});release();
  const [obsolete]=await oldResult;assert.equal(obsolete.status,'rejected');assert.match(obsolete.reason.message,/预览参数已更新/);
  const [actual,latest]=await Promise.all([exported,newest]);assert.equal(actual.format,'jpeg');assert.ok(service.result(actual.token));assert.equal(latest.unchanged,true);assert.equal(encodes,2,'only the two running lossless probes finish; obsolete lossy searches never start');
 }finally{release();sharp.prototype.png=png;}
});
