import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ProjectStore} from '../engine/project-store.mjs';
import {ImageService} from '../engine/service.mjs';
import {StitchService} from '../engine/stitch-service.mjs';
import {moveImage,initializeFree,calculateLayout} from '../engine/stitch-layout.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {optimizeHorizontal} from '../engine/stitch-optimize.mjs';
import {appendFixedImages,arrangeImages} from '../engine/canvas-fixed.mjs';
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-stitch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(path.join(root,'store')),images=new ImageService();return {root,store,images,service:new StitchService(store,images)};}
const settings={longEdge:120,format:'png',targetBytes:1000000};
async function solid(store,name,width,height,color){const source=await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer();const item=await store.import(source,name);delete item.preview;return item;}
test('real 4K example exports rectangular transparent PNG with zero padding and correct pixel boundaries',async t=>{
 const {store,images,service}=await setup(t);
 const files=[];for(const [name,w,h,color] of [['a',3072,4096,'#ff0000'],['b',3072,4096,'#00ff00'],['c',2160,3840,'#0000ff'],['d',2160,3840,'#ffff0080']])files.push(await solid(store,name,w,h,color));
 const project={id:'four-portraits',name:'四张4K',images:files,layout:'horizontal',export:{...settings,longEdge:5999}};
 const result=await service.render(project),output=images.result(result.token).output,meta=await sharp(output.buffer).metadata();
 assert.deepEqual([meta.width,meta.height],[5999,2400]);assert.equal(meta.format,'png');assert.ok(output.buffer.length<=1000000);assert.equal(output.paddedBytes,0);
 const {data,info}=await sharp(output.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x,y)=>[...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)];
 assert.deepEqual(pixel(0,0),[255,0,0,255]);assert.deepEqual(pixel(1799,2399),[255,0,0,255]);assert.deepEqual(pixel(1800,0),[0,255,0,255]);assert.deepEqual(pixel(3600,0),[0,0,255,255]);
 assert.equal(pixel(5998,2399)[3],128,'last corner preserves transparency rather than a rounded mask');
 assert.deepEqual(files.map(f=>[f.width,f.height]),[[3072,4096],[3072,4096],[2160,3840],[2160,3840]]);
});
test('manual top and bottom crop preserves surviving rows pixel-for-pixel on export',async t=>{
 const {store,images,service}=await setup(t),width=32,height=40;
 const raw=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.set([x*7,y*6,x+y,255],4*(y*width+x));
 const image=await store.import(await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer(),'ramp.png');
 const project={id:'crop-rows',layout:'horizontal',canvasMode:'fixed',heightLocked:true,canvasSizing:'manual',
  canvas:{width,height},images:[image],positions:{[image.id]:{x:0,y:0,width,height}},export:{...settings,longEdge:height}};
 const top=3,bottom=7,edited=setImageEdit(project,image.id,{edges:{left:0,right:0,top,bottom}});
 const result=await service.render(edited);
 const {data,info}=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.deepEqual([info.width,info.height],[width,height]);
 const first=top*width*4,last=(height-bottom)*width*4;
 assert.deepEqual(data.subarray(first,last),raw.subarray(first,last));
 for(const rows of [data.subarray(0,first),data.subarray(last)])assert.ok(rows.every((v,i)=>i%4!==3||v===0));
});
test('separate and batch exports use their own formats, resolutions and actual byte ceilings',async t=>{
 const {root,store,images,service}=await setup(t),red=await solid(store,'red',80,80,'#ff000080'),blue=await solid(store,'blue',80,80,'#0000ff');
 const projects=[{id:'one',name:'one',images:[red,blue],layout:'horizontal',export:settings},{id:'two',name:'two',images:[red],layout:'vertical',export:{...settings,longEdge:80,format:'jpeg'}}];
 const paths=[];for(const p of projects){await store.save(p);const r=await service.render(await store.load(p.id),null);paths.push(await images.save(r.token,root));}
 assert.notEqual(paths[0].path,paths[1].path);
 for(let n=0;n<paths.length;n++){const meta=await sharp(paths[n].path).metadata();assert.equal(meta.format,n===0?'png':'jpeg');assert.equal(Math.max(meta.width,meta.height),projects[n].export.longEdge);assert.equal((await fs.stat(paths[n].path)).size,paths[n].bytes);assert.ok(paths[n].bytes<=projects[n].export.targetBytes);}
 const corner=await sharp(paths[1].path).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.ok(corner[1]>110&&corner[2]>110,'JPEG flattens transparent red onto white');
});
test('newer previews discard queued old previews but never discard a true export',async t=>{
 const {store,images,service}=await setup(t),item=await solid(store,'one',60,60,'#6688aa');
 const project={id:'project',images:[item],layout:'horizontal',export:settings};
 const first=service.render(project,{latest:true}),exported=service.render(project),obsolete=service.render({...project,export:{...settings,longEdge:80}},{latest:true}),newest=service.render({...project,export:{...settings,longEdge:90}},{latest:true});
 await assert.rejects(first,/预览参数/);await assert.rejects(obsolete,/预览参数/);const result=await exported;assert.ok(images.result(result.token));assert.equal((await newest).width,90);assert.ok(images.result(result.token),'new preview must not invalidate export token');
});
test('free internal gaps are transparent and image ordering controls actual overlap pixels',async t=>{
 const {store,images,service}=await setup(t),red=await solid(store,'red',100,100,'#ff0000'),blue=await solid(store,'blue',100,100,'#0000ff');
 const p={id:'free-project',images:[red,blue],layout:'free',positions:{[red.id]:{x:-20,y:-30,width:50},[blue.id]:{x:80,y:20,width:100}},export:{...settings,longEdge:200}};
 let result=await service.render(p),data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();
 const pixel=(x,y)=>[...data.subarray((y*200+x)*4,(y*200+x)*4+4)];assert.deepEqual(pixel(0,0),[255,0,0,255]);assert.equal(pixel(199,0)[3],0);assert.deepEqual(pixel(199,149),[0,0,255,255]);
 p.positions[blue.id]={x:0,y:0,width:100};p.positions[red.id]={x:0,y:0,width:100};result=await service.render(p);data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([...data.subarray(0,4)],[0,0,255,255]);
 result=await service.render({...p,images:[blue,red]});data=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([...data.subarray(0,4)],[255,0,0,255]);
});
test('grid composes mixed aspect ratios into completely filled rows without automatic crop',async t=>{
 const {store,images,service}=await setup(t),items=[await solid(store,'a',60,80,'#ff0000'),await solid(store,'b',45,80,'#00ff00'),await solid(store,'c',90,60,'#0000ff')];
 const p={id:'grid-project',images:items,layout:'grid',grid:{rows:2,columns:2},export:settings},r=await service.render(p),{data}=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.ok(r.layout.rects.every(i=>i.crop===null));for(let i=3;i<data.length;i+=4)assert.equal(data[i],255,'no hidden transparent grid cells or gaps');
});
test('actual manual crops keep exact centre source pixels, alpha and original copies',async t=>{
 const {store,images,service}=await setup(t),width=120,height=100,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x;data[i+1]=y;data[i+2]=(x*3+y*5)%256;data[i+3]=255;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),item=await store.import(source,'pixel-pattern.png');delete item.preview;
 for(const [axis,amount,longEdge] of [['horizontal',10,100],['vertical',20,120]]){
  const p={id:'manual-'+axis,images:[item],layout:'horizontal',edits:{[item.id]:{axis,amount}},export:{...settings,longEdge}};
  await store.save(p);const restored=await store.load(p.id),r=await service.render(restored),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
  const expected=await sharp(source).extract(axis==='horizontal'?{left:10,top:0,width:100,height:100}:{left:0,top:20,width:120,height:60}).ensureAlpha().raw().toBuffer();
  assert.ok(actual.equals(expected));assert.ok((await store.readAsset(item.assetId)).equals(source));assert.deepEqual(restored.edits,p.edits);
 }
});
test('automatic layout reorder changes saved order and actual export colours',async t=>{
 const {store,images,service}=await setup(t),red=await solid(store,'red',60,90,'#ff0000'),green=await solid(store,'green',60,90,'#00ff00'),blue=await solid(store,'blue',60,90,'#0000ff');
 const p={id:'reordered',images:moveImage([red,green,blue],red.id,blue.id),layout:'horizontal',export:{...settings,longEdge:180}};await store.save(p);
 const restored=await store.load(p.id),r=await service.render(restored),raw=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
 assert.deepEqual(restored.images.map(i=>i.id),[green.id,blue.id,red.id]);
 for(const [x,color] of [[0,[0,255,0,255]],[60,[0,0,255,255]],[120,[255,0,0,255]]])assert.deepEqual([...raw.subarray(x*4,x*4+4)],color);
});
test('manual crop coordinates follow EXIF-oriented display pixels rather than encoded file axes',async t=>{
 const {store,images,service}=await setup(t),source=await sharp({create:{width:90,height:60,channels:3,background:'#aa5544'}}).composite([{input:await sharp({create:{width:30,height:60,channels:3,background:'#3366aa'}}).png().toBuffer(),left:0,top:0}]).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
 const item=await store.import(source,'rotated.jpg');delete item.preview;assert.deepEqual([item.width,item.height],[60,90]);
 const p={id:'exif-crop',images:[item],layout:'horizontal',edits:{[item.id]:{axis:'horizontal',amount:5}},export:{...settings,longEdge:90}},r=await service.render(p),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
 const expected=await sharp(source).rotate().extract({left:5,top:0,width:50,height:90}).ensureAlpha().raw().toBuffer();assert.deepEqual([r.width,r.height],[50,90]);assert.ok(actual.equals(expected));
});

test('one-click 4K crop removes both sides of every ratio and saves an exact transparent 5988 x 2495 PNG',async t=>{
 const {root,store,images,service}=await setup(t),files=[],buffers=[],colors=['#ff0000','#00ff00','#0000ff','#ffff0080'];
 for(const [n,[width,height]] of [[3072,4096],[3072,4096],[2160,3840],[2160,3840]].entries()){
  const strip=await sharp({create:{width:30,height,channels:4,background:'#ff00ff'}}).png().toBuffer();
  const overlays=[{input:strip,left:0,top:0},{input:strip,left:width-30,top:0}];
  if(n===2)overlays.push({input:await sharp({create:{width,height:576,channels:4,background:'#ff6600'}}).png().toBuffer(),left:0,top:0});
  const source=await sharp({create:{width,height,channels:4,background:colors[n]}}).composite(overlays).png().toBuffer();
  buffers.push(source);const image=await store.import(source,'original-'+n+'.png');delete image.preview;files.push(image);
 }
 const p={id:'one-click-4k',name:'一键优化',images:files,layout:'horizontal',edits:{[files[0].id]:{axis:'vertical',amount:30}},export:{...settings,longEdge:5999}},optimized=optimizeHorizontal(p);
 await store.save(optimized);const reopened=new ProjectStore(store.root),restored=await reopened.load(p.id);
 assert.deepEqual(restored.edits,optimized.edits);assert.equal(restored.export.longEdge,5988);
 const r=await service.render(restored),saved=await images.save(r.token,root),meta=await sharp(saved.path).metadata();
 assert.deepEqual([meta.width,meta.height],[5988,2495]);assert.equal(meta.width*5,meta.height*12);assert.equal(meta.format,'png');assert.equal((await fs.stat(saved.path)).size,saved.bytes);assert.ok(saved.bytes<=settings.targetBytes);
 const {data,info}=await sharp(saved.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const [n,rect] of r.layout.rects.entries()){
  const expected=n===0?[255,0,0,255]:n===1?[0,255,0,255]:n===2?[0,0,255,255]:[255,255,0,128];
  for(const [x,y] of [[rect.x,0],[rect.x+rect.width-1,info.height-1]]){const offset=(y*info.width+x)*4;assert.deepEqual([...data.subarray(offset,offset+4)],expected,'both source side strips removed, square corners retained');}
  if(n===2){assert.deepEqual(restored.edits[files[n].id].edges,{left:100,right:100,top:576,bottom:0});assert.equal(rect.crop.top,.15);assert.equal(rect.crop.left,100/2160);}else assert.ok(rect.proportionalCrop);
  assert.ok(!rect.autoCrop);assert.ok((await reopened.readAsset(files[n].assetId)).equals(buffers[n]));
 }
});

test('percentage crop samples original centres symmetrically at different export sizes and after entering free',async t=>{
 const {store,images,service}=await setup(t),data=Buffer.alloc(140*100*4);
 for(let y=0;y<100;y++)for(let x=0;x<140;x++){const offset=(y*140+x)*4;data[offset]=x;data[offset+1]=y;data[offset+2]=180;data[offset+3]=y<50?255:128;}
 const source=await sharp(data,{raw:{width:140,height:100,channels:4}}).png().toBuffer(),a=await store.import(source,'a.png'),b=await store.import(source,'b.png');delete a.preview;delete b.preview;
 for(const longEdge of [240,480]){
  const p=optimizeHorizontal({id:'centred-'+longEdge,images:[a,b],layout:'horizontal',export:{...settings,longEdge}}),r=await service.render(p);
  assert.equal(r.width*5,r.height*12);
  const raw=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
  for(const rect of r.layout.rects){const pixel=x=>raw.subarray((Math.floor(r.height*.25)*r.width+x)*4,(Math.floor(r.height*.25)*r.width+x)*4+4);const left=pixel(rect.x),right=pixel(rect.x+rect.width-1);assert.ok(left[0]>=9&&left[0]<=11);assert.ok(right[0]>=128&&right[0]<=130);assert.ok(Math.abs(left[0]-(139-right[0]))<=1);assert.equal(left[3],255);}
  for(const layout of ['vertical','grid','free']){
   const single={...p,images:[a],grid:{rows:1,columns:1},layout:'horizontal'};
   const next=layout==='free'?initializeFree(single,calculateLayout(single),'centres'):{...single,layout};
   const result=await service.render(next);assert.deepEqual([result.width,result.height],[longEdge,Math.round(longEdge/1.2)]);
   const actual=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();
   assert.ok(actual[0]>=9&&actual[0]<=11);assert.equal(actual[3],255);assert.equal(actual[actual.length-1],128);assert.equal(result.layout.rects[0].crop.top,0);
  }
 }
});
test('obsolete in-flight compositions stop loading remaining originals without discarding true exports',async t=>{
 const {store,images,service}=await setup(t),a=await solid(store,'a',80,80,'#ff0000'),b=await solid(store,'b',80,80,'#0000ff');
 const p={id:'in-flight-stitch',images:[a,b],layout:'horizontal',export:settings};
 let enter,release,reads=0;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),read=store.readAsset.bind(store);
 store.readAsset=async id=>{if(++reads===1){enter();await gate;}return read(id);};
 const obsolete=Promise.allSettled([service.render(p,{latest:true})]);await entered;
 const exported=service.render(p),latest=service.render({...p,export:{...settings,longEdge:100}},{latest:true});release();
 const [old]=await obsolete;assert.equal(old.status,'rejected');assert.match(old.reason.message,/预览参数已更新/);
 const [result,newest]=await Promise.all([exported,latest]);assert.equal(reads,5,'obsolete composition reads only its current asset');assert.equal(newest.width,100);assert.ok(images.result(result.token));
});

test('fixed export clips every canvas edge from source pixels without modifying originals or poses',async t=>{
 const {store,images,service}=await setup(t),width=120,height=100,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x;data[i+1]=y;data[i+2]=170;data[i+3]=255;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),item=await store.import(source,'coordinates.png');delete item.preview;
 for(const [x,y] of [[-20,-10],[30,40],[-30,40],[40,-20]]){
  const pose={x,y,width,height},p={id:'fixed-clip',canvasMode:'fixed',canvas:{width:100,height:100},images:[item],layout:'free',positions:{[item.id]:pose},export:settings};
  await store.save(p);const r=await service.render(await store.load(p.id)),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([r.width,r.height],[100,100]);
  for(let cy=0;cy<100;cy++)for(let cx=0;cx<100;cx++){
   const offset=(cy*100+cx)*4,sx=cx-x,sy=cy-y,inside=sx>=0&&sx<width&&sy>=0&&sy<height;
   assert.deepEqual([...actual.subarray(offset,offset+4)],inside?[sx,sy,170,255]:[0,0,0,0]);
  }
  assert.deepEqual((await store.load(p.id)).positions[item.id],pose);assert.ok((await store.readAsset(item.assetId)).equals(source));
 }
});
test('fixed Shift stretches and manual crops match explicit resize pixels before boundary clipping',async t=>{
 const {store,images,service}=await setup(t),width=60,height=40,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x*4;data[i+1]=y*6;data[i+2]=180;data[i+3]=x<30?255:128;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),item=await store.import(source,'stretch-alpha.png');delete item.preview;
 const p={id:'fixed-stretch',canvasMode:'fixed',canvas:{width:100,height:60},images:[item],layout:'horizontal',positions:{[item.id]:{x:-10,y:-5,width:110,height:65}},edits:{[item.id]:{axis:'horizontal',amount:5}},export:settings};
 const r=await service.render(p),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
 const resized=await sharp(source).extract({left:5,top:0,width:50,height:40}).resize(110,65,{fit:'fill'}).extract({left:10,top:5,width:100,height:60}).ensureAlpha().raw().toBuffer();
 const expected=await sharp({create:{width:100,height:60,channels:4,background:'#00000000'}}).composite([{input:resized,raw:{width:100,height:60,channels:4}}]).raw().toBuffer();
 assert.deepEqual([r.width,r.height],[100,60]);assert.ok(actual.equals(expected));assert.ok((await store.readAsset(item.assetId)).equals(source));
});
test('images wholly outside fixed canvas are neither decoded nor included in export',async t=>{
 const {store,images,service}=await setup(t),a=await solid(store,'visible',20,20,'#ff0000'),b=await solid(store,'outside',20,20,'#00ff00');let reads=0;
 const read=store.readAsset.bind(store);store.readAsset=async id=>{reads++;return read(id);};
 const p={id:'fixed-outside',canvasMode:'fixed',canvas:{width:100,height:100},images:[a,b],layout:'free',positions:{[a.id]:{x:10,y:10,width:20,height:20},[b.id]:{x:100,y:0,width:5000,height:5000}},export:settings};
 const r=await service.render(p),data=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();assert.equal(reads,1);assert.deepEqual([r.width,r.height],[100,100]);assert.equal(data[(10*100+10)*4],255);assert.equal(data[3],0);assert.equal(p.images.length,2);
});

test('changing crop association preferences reuses exact encoded pixels without decoding sources again',async t=>{
 const {store,service}=await setup(t),image=await solid(store,'link',100,100,'#3377aa');let reads=0;const read=store.readAsset.bind(store);store.readAsset=async id=>{reads++;return read(id);};
 const p={id:'links',canvasMode:'fixed',canvas:{width:100,height:100},images:[image],layout:'horizontal',positions:{[image.id]:{x:0,y:0,width:100,height:100}},edits:{[image.id]:{edges:{left:0,top:0,right:0,bottom:0},links:{horizontal:true,vertical:true}}},export:settings};
 const first=await service.render(p,{latest:true});p.edits[image.id]={edges:{right:0,bottom:0,left:0,top:0},links:{horizontal:false,vertical:true}};const second=await service.render(p,{latest:true});assert.equal(reads,1);assert.equal(second.token,first.token);assert.equal(second.bytes,first.bytes);
});
test('fixed 4K right append clips the last image while presets retain full images and exact default canvas',async t=>{
 const {store,images,service}=await setup(t),files=[];
 for(const [name,w,h,color] of [['a',3072,4096,'#ff0000'],['b',3072,4096,'#00ff00'],['c',2160,3840,'#0000ff'],['d',2160,3840,'#ffff0080']])files.push(await solid(store,name,w,h,color));
 const p=appendFixedImages({id:'fixed-four',canvasMode:'fixed',canvas:{width:5995,height:2398},images:[],layout:'horizontal',positions:{},edits:{},export:{...settings,longEdge:5995}},files);
 const result=await service.render(p),saved=images.result(result.token).output,raw=await sharp(saved.buffer).ensureAlpha().raw().toBuffer();
 assert.deepEqual([result.width,result.height],[5995,2398]);assert.ok(saved.buffer.length<=settings.targetBytes);assert.deepEqual([...raw.subarray(raw.length-4)],[255,255,0,128]);assert.ok(result.layout.rects.every(r=>!r.autoCrop&&!r.crop));assert.ok(p.positions[files[3].id].x+p.positions[files[3].id].width>5995);
 const arranged=await service.render(arrangeImages(p)),data=await sharp(images.result(arranged.token).output.buffer).ensureAlpha().raw().toBuffer();assert.deepEqual([arranged.width,arranged.height],[5995,2398]);assert.equal(data[3],0,'only user-confirmed internal transparent space, no canvas growth');
});
test('fixed percentage crop remains centred and clipped correctly after nonuniform resizing',async t=>{
 const {store,images,service}=await setup(t),width=120,height=100,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x;data[i+1]=y;data[i+2]=80;data[i+3]=255;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),item=await store.import(source,'percentage.png');delete item.preview;
 const p={id:'fraction-clipped',canvasMode:'fixed',canvas:{width:100,height:100},images:[item],positions:{[item.id]:{x:-10,y:-5,width:120,height:105}},edits:{[item.id]:{axis:'horizontal',fraction:.1}},layout:'free',export:settings};
 const r=await service.render(p),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer(),expected=await sharp(source).resize(150,105,{fit:'fill'}).extract({left:25,top:5,width:100,height:100}).ensureAlpha().raw().toBuffer();assert.ok(actual.equals(expected));
});

test('renamed canvas exports use its complete current name for web and desktop even with cached pixels',async t=>{
 const {root,store,images,service}=await setup(t),item=await solid(store,'original.png',80,60,'#336699');
 const first={id:'renamed',name:'旧名称',images:[item],layout:'horizontal',export:settings};
 const preview=await service.render(first,{latest:true}),before=images.result(preview.token).output.buffer;
 for(const [name,expected] of [['画布 12','画布 12.png'],['我的成片.v1.2','我的成片.v1.2.png'],['批次二','批次二.png'],['成片.png','成片.png'],['海报/终稿:一','海报_终稿_一.png'],['CON.final','_CON.final.png']]){
  const p={...first,name};await store.save(p);const result=await service.render(await store.load(p.id));
  const download=images.download(result.token);assert.equal(download.name,expected);assert.ok(Buffer.from(download.base64,'base64').equals(before));
  const saved=await images.save(result.token,root);assert.equal(path.basename(saved.path),expected);assert.ok((await fs.readFile(saved.path)).equals(before));
 }
 const next=await service.render({...first,name:'画布 12'}),saved=await images.save(next.token,root);assert.equal(path.basename(saved.path),'画布 12-2.png');
 assert.ok((await fs.readFile(path.join(root,'画布 12.png'))).equals(before),'a duplicate name never overwrites an existing export');
});

test('narrow-image optimization exports the entire source and centres it in a manual frame',async t=>{
 const {store,images,service}=await setup(t),raw=Buffer.alloc(100*100*4);
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){const o=(y*100+x)*4;raw[o]=x;raw[o+1]=y;raw[o+2]=180;raw[o+3]=255;}
 const source=await sharp(raw,{raw:{width:100,height:100,channels:4}}).png().toBuffer(),item=await store.import(source,'square.png');delete item.preview;
 for(const fixed of [true,false]){
  const p=optimizeHorizontal({id:'vertical-opt-'+fixed,images:[item],layout:'horizontal',optimization:{specialCrops:{}},...(fixed?{canvasMode:'fixed',canvas:{width:250,height:100},positions:{[item.id]:{x:0,y:0,width:250,height:100}}}:{}),export:{...settings,longEdge:250}});
  await store.save(p);const restored=await store.load(p.id),r=await service.render(restored),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer();
  const expected=await (fixed?sharp(source).extend({left:70,right:70,top:0,bottom:0,background:'#00000000'}):sharp(source).resize(250,250)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([r.width,r.height],fixed?[240,100]:[250,250]);assert.ok(actual.equals(expected),'all source pixels remain visible');assert.ok((await store.readAsset(item.assetId)).equals(source));assert.deepEqual(restored.edits,p.edits);
 }
});

test('the ready composite retains Retina preview detail instead of replacing clear source layers with a smaller raster',async t=>{
 const {store,images,service}=await setup(t),item=await solid(store,'fine-preview',1500,1000,'#4477aa');delete item.preview;
 const p={id:'retina-ready',images:[item],layout:'horizontal',export:{...settings,longEdge:1500}},r=await service.render(p),preview=await sharp(Buffer.from(r.preview.split(',')[1],'base64')).metadata();
 assert.deepEqual([preview.width,preview.height],[1500,1000]);assert.deepEqual([r.width,r.height],[1500,1000]);assert.ok(images.result(r.token).output.buffer.length<=settings.targetBytes);
});

test('a fitting oriented original survives switching canvases, and ignores a legacy size floor until actual edits change the result',async t=>{
 const {store,images,service}=await setup(t);
 const file=await sharp({create:{width:48,height:24,channels:3,background:'#8670aa'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const image=await store.import(file,'sideways.jpg');
 const pose={x:0,y:0,width:24,height:48};
 const project={id:'original-one',images:[image],canvasMode:'fixed',layout:'free',canvas:{width:24,height:48},positions:{[image.id]:pose},export:{format:'jpeg',targetBytes:30000000}};
 const first=await service.render(project,{latest:true});
 assert.equal(first.unchanged,true);assert.deepEqual(images.result(first.token).output.buffer,file);
 const thumb=await sharp(Buffer.from(first.preview.split(',')[1],'base64')).metadata();
 assert.deepEqual([thumb.width,thumb.height],[24,48]);
 await service.render({...project,id:'original-two'},{latest:true});
 assert.equal((await service.render({...structuredClone(project),name:'new name'},{latest:true})).token,first.token);
 const legacy=await service.render({...project,export:{...project.export,minimumBytes:1000000}});
 assert.deepEqual(images.result(legacy.token).output.buffer,file);
 const moved=await service.render({...project,positions:{[image.id]:{...pose,x:8}}});
 assert.ok(!moved.unchanged);assert.notDeepEqual(images.result(moved.token).output.buffer,file);
});

test('saved image color invalidates the original export fast path and render cache', async t => {
 const {store,images,service}=await setup(t);
 const item=await solid(store,'color.png',120,120,'#806448');
 const project={id:'color-export',images:[item],layout:'horizontal',export:settings};
 const original=await store.readAsset(item.assetId);
 assert.equal((await service.render(project,{latest:true})).unchanged,true);
 project.images=[{...item,color:{adjustments:{saturation:-100}}}];
 await store.save(project);
 const restored=await store.load(project.id),result=await service.render(restored);
 const raw=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();
 assert.deepEqual([...raw.subarray(0,4)],[104,104,104,255]);
 assert.equal(Boolean(result.unchanged),false);
 assert.deepEqual(restored.images[0].color,project.images[0].color);
 assert.deepEqual(await store.readAsset(item.assetId),original);
});
