import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {StitchService} from '../engine/stitch-service.mjs';
import {ImageService} from '../engine/service.mjs';
import {encodeStitchPng} from '../engine/stitch-png.mjs';

test('large fast full-colour PNG preserves every RGBA pixel and the actual budget without palette or padding',async()=>{
 const info={width:1250,height:800,channels:4},data=Buffer.alloc(1250*800*4);let seed=721;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
 const result=await encodeStitchPng(data,info,5000000),meta=await sharp(result.buffer).metadata(),decoded=await sharp(result.buffer).raw().toBuffer();
 assert.ok(result.buffer.length<=5000000);assert.equal(result.lossless,true);assert.equal(meta.isPalette,false);assert.deepEqual([meta.width,meta.height],[1250,800]);assert.ok(decoded.equals(data));assert.equal(result.autoResized,false);
});
test('cached preview and separate export tokens reuse exact bytes without reading or decoding original assets again',async()=>{
 const buffer=await sharp({create:{width:80,height:80,channels:4,background:'#33669980'}}).png().toBuffer(),image={id:'one',assetId:'a'.repeat(64),width:80,height:80,bytes:buffer.length};let reads=0;
 const store={validate:()=>{},readAsset:async()=>{reads++;return buffer;}},images=new ImageService(),service=new StitchService(store,images),p={id:'cache',name:'old',canvasMode:'fixed',canvas:{width:80,height:80},images:[image],positions:{one:{x:0,y:0,width:80,height:80}},layout:'free',export:{format:'png',targetBytes:1000000}};
 const preview=await service.render(p,{latest:true}),same=await service.render({...p,name:'renamed'},{latest:true}),exported=await service.render({...p,name:'renamed'});
 assert.equal(reads,1);assert.equal(preview.token,same.token);assert.notEqual(exported.token,preview.token);assert.ok(images.result(exported.token).output.buffer.equals(images.result(preview.token).output.buffer));assert.equal(images.result(exported.token).name,'renamed');
 const changed=await service.render({...p,positions:{one:{x:10,y:0,width:80,height:80}}},{latest:true});assert.equal(reads,2);assert.notEqual(changed.token,preview.token);assert.ok(images.result(exported.token),'new previews retain pinned exports');service.release(p.id);assert.equal(service.ready.has(p.id),false);
});
