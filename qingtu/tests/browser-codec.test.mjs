import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeImageMagick} from '@imagemagick/magick-wasm';
import sharp from 'sharp';
import {inspect,encode,preview} from '../src/browser/codec.js';

before(async()=>initializeImageMagick(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')))));
for(const format of ['jpeg','png','webp','avif','tiff']){
 test(`browser decodes a single-frame ${format} and previews it in display orientation`,async()=>{
  const source=sharp({create:{width:40,height:20,channels:4,background:'#77331180'}});
  const bytes=await source[format]().toBuffer(),file=new Blob([bytes]);
  const inspected=await inspect(file);assert.equal(inspected.meta.format,format);
  const result=preview(inspected.bytes);assert.deepEqual([result.previewWidth,result.previewHeight],[40,20]);
  const output=await encode(file,inspected.meta,{format:'png',targetBytes:10000,resize:{type:'scale',percent:50}});
  const meta=await sharp(Buffer.from(await output.blob.arrayBuffer())).metadata();
  assert.deepEqual([meta.format,meta.width,meta.height],['png',20,10]);assert.ok(output.bytes<=10000);
 });
}
test('browser keeps a fitting original, respects byte limits and preserves requested pixel dimensions',async()=>{
 const photo=await readFile(new URL('../public/samples/alpine-lake.jpg',import.meta.url));
 const file=new Blob([photo]),{meta}=await inspect(file);
 const original=await encode(file,meta,{format:'jpeg',targetBytes:photo.length});
 assert.equal(original.unchanged,true);assert.equal(original.blob,file);
 const resize={type:'pixels',locked:false,width:250,height:100};
 for(const [format,targetBytes] of [['jpeg',2000],['png',2000],['png',100000]]){
  const result=await encode(file,meta,{format,targetBytes,resize});assert.ok(result.bytes<=targetBytes);
  const actual=await sharp(Buffer.from(await result.blob.arrayBuffer())).metadata();
  assert.equal(actual.format,format);assert.equal(actual.width,result.width);assert.equal(actual.height,result.height);
  if(format==='png'){if(targetBytes===2000)assert.equal(result.lossless,false);assert.equal(result.autoResized,false);assert.deepEqual([actual.width,actual.height],[250,100]);}
 }
});

test('browser PNG preserves full resolution and exact alpha when bounded RGB errors meet the ceiling',async()=>{
 const width=240,height=180,data=Buffer.alloc(width*height*4);let seed=99;
 for(let i=0;i<data.length;i+=4){
  for(let c=0;c<3;c++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i+c]=100+c*20+(seed>>>28);}
  data[i+3]=32+i/4%224;
 }
 const file=new Blob([await sharp(data,{raw:{width,height,channels:4}}).tiff({compression:'lzw'}).toBuffer()]);
 const {meta}=await inspect(file),full=await encode(file,meta,{format:'png',targetBytes:1000000});
 const targetBytes=Math.floor(full.bytes*.98),result=await encode(file,meta,{format:'png',targetBytes});
 assert.equal(result.autoResized,false);assert.ok(result.bytes<=targetBytes);
 const actual=await sharp(Buffer.from(await result.blob.arrayBuffer())).raw().toBuffer();
 let squares=0;
 for(let i=0;i<data.length;i++){
  const d=Math.abs(data[i]-actual[i]);assert.ok(d<=(i%4===3?0:2));squares+=d*d;
 }
 assert.ok(Math.sqrt(squares/(width*height*3))<=1.5);
});

test('browser resize uses EXIF display dimensions and clears the old orientation',async()=>{
 const source=await sharp({create:{width:40,height:20,channels:3,background:'red'}}).withMetadata({orientation:6}).jpeg().toBuffer();
 const file=new Blob([source]),{meta}=await inspect(file);assert.deepEqual([meta.width,meta.height],[20,40]);
 const result=await encode(file,meta,{format:'jpeg',targetBytes:10000,resize:{type:'scale',percent:50}});
 const saved=await sharp(Buffer.from(await result.blob.arrayBuffer())).metadata();
 assert.deepEqual([saved.width,saved.height],[10,20]);assert.ok(!saved.orientation||saved.orientation===1);
});
test('a multi-page TIFF is rejected before generating a single-frame preview',async()=>{
 const bytes=await sharp(Buffer.alloc(40*40*3,100),{raw:{width:40,height:40,channels:3,pageHeight:20}}).tiff().toBuffer();
 assert.equal((await sharp(bytes).metadata()).pages,2);
 await assert.rejects(inspect(new Blob([bytes])),/多页/);
});

test('old minimum settings never inflate a fitting JPG or PNG',async()=>{
 const {processImage}=await import('../engine/image.mjs');
 for(const format of ['png','jpeg']){
  const source=await sharp({create:{width:60,height:45,channels:4,background:'#28ace488'}})[format]().withMetadata().toBuffer();
  const file=new Blob([source]),{meta}=await inspect(file);
  const settings={mode:'smart',format,minimumBytes:50000000,targetBytes:30000000};
  const native=await processImage(source,settings),web=await encode(file,meta,settings);
  assert.deepEqual(native.buffer,source);assert.deepEqual(Buffer.from(await web.blob.arrayBuffer()),source);
  assert.ok(native.unchanged&&web.unchanged);
 }
});

test('5999 is inclusive and oversized compression outputs fit that long edge on both backends',async()=>{
 const {processImage}=await import('../engine/image.mjs');
 for(const [width,height,w,h] of [[5998,200,5998,200],[5999,200,5999,200],[6000,200,5999,200],[400,7200,333,5999]]){
  const source=await sharp({create:{width,height,channels:3,background:'#d78942'}}).jpeg().toBuffer();
  const file=new Blob([source]),{meta}=await inspect(file),settings={mode:'smart',format:'jpeg',targetBytes:30000000};
  const native=await processImage(source,settings),web=await encode(file,meta,settings);
  for(const [output,buffer] of [[native,native.buffer],[web,Buffer.from(await web.blob.arrayBuffer())]]){
   assert.deepEqual([output.width,output.height],[w,h]);
   const saved=await sharp(buffer).metadata();assert.deepEqual([saved.width,saved.height],[w,h]);
   if(width===w&&height===h)assert.deepEqual(buffer,source);
  }
 }
});
