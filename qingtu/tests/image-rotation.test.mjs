import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {mirrorProjectImage,rotateProjectImage,setProjectImageAngle} from '../engine/image-rotation.mjs';
import {stitchRenderKey} from '../engine/stitch-render-input.mjs';
import {applyPortraitRetouch} from '../engine/portrait-retouch.mjs';
import {sourceWindow} from '../engine/image-source.mjs';
import {imageGeometry} from '../engine/stitch-edits.mjs';
import {splitProjectImage} from '../engine/stitch-split.mjs';
import {ProjectStore} from '../engine/project-store.mjs';
import {ImageService} from '../engine/service.mjs';
import {StitchService,composeProject} from '../engine/stitch-service.mjs';
const image={id:'a',assetId:'a'.repeat(64),width:80,height:40,bytes:100},pose={x:30,y:50,width:160,height:80};
const project=()=>({id:'rotation',canvasMode:'fixed',heightLocked:true,canvasSizing:'manual',canvas:{width:300,height:300},layout:'horizontal',images:[image],initialOrder:['a'],positions:{a:pose},edits:{},importSizes:{a:{width:160,height:80}},layoutStates:{horizontal:{a:pose},free:{a:{x:-20,y:10,width:80,height:40}}},export:{format:'png',targetBytes:1000000,longEdge:300}});
test('horizontal mirror reflects crop and rotation, while a second click restores the same render key',()=>{
 const first={...project(),images:[{...image,width:30,height:20,source:{left:10,top:5,width:30,height:20,fullWidth:80,fullHeight:40}}],
  edits:{a:{edges:{left:1,top:2,right:3,bottom:4},links:{horizontal:false,vertical:false}}}};
 const base=setProjectImageAngle(rotateProjectImage(first,'a',90),'a',105);
 const result=mirrorProjectImage(base,'a'),mirrored=result.images[0];
 assert.equal(mirrored.rotation,270);assert.equal(mirrored.angle,-15);
 assert.equal(mirrored.mirrored,true);assert.equal(mirrored.assetId,image.assetId);
 assert.deepEqual(result.positions,base.positions);
 assert.deepEqual(result.edits.a.edges,{left:2,right:4,top:1,bottom:3});
 assert.equal(sourceWindow(mirrored).left,5);
 assert.notEqual(stitchRenderKey(result),stitchRenderKey(base));
 assert.equal(stitchRenderKey(mirrorProjectImage(result,'a')),stitchRenderKey(base));
});

test('a mirrored export preserves the cropped, EXIF-oriented pixels and survives reload',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-mirror-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new ProjectStore(root);
 const original=await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="#779944"/><rect x="31" y="8" width="25" height="33" fill="#cc4477"/></svg>')).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
 const item=await store.import(original,'oriented.jpg');delete item.preview;
 const piece={...item,width:20,height:40,source:{left:10,top:20,width:20,height:40,fullWidth:40,fullHeight:80}};
 const base=rotateProjectImage({...project(),images:[piece],initialOrder:[piece.id],
  positions:{[piece.id]:{x:24,y:24,width:14,height:32}},edits:{[piece.id]:{edges:{left:2,top:3,right:4,bottom:5}}},
  layoutStates:undefined,importSizes:undefined,canvas:{width:80,height:80}},piece.id,90);
 const previous=await composeProject(base,store),rect=previous.layout.rects[0];
 const mirrored=mirrorProjectImage(base,piece.id);await store.save(mirrored);
 const loaded=await store.load(base.id);
 assert.equal(loaded.images[0].mirrored,true);
 const before=await sharp(previous.data,{raw:previous.info}).extract({left:rect.x,top:rect.y,width:rect.width,height:rect.height}).raw().toBuffer({resolveWithObject:true});
 const expected=await sharp(before.data,{raw:before.info}).flop().raw().toBuffer();
 const result=await composeProject(loaded,store);
 const actual=await sharp(result.data,{raw:result.info}).extract({left:rect.x,top:rect.y,width:rect.width,height:rect.height}).raw().toBuffer();
 assert.deepEqual(actual,expected);assert.deepEqual(await store.readAsset(item.assetId),original);
});
test('existing portrait adjustments follow the reflected image pixels',()=>{
 const width=64,height=52,frame={width,height};
 const source=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>[(i%width)*3,(i*13)%253,70,255]).flat());
 const flip=pixels=>{
  const output=new Uint8ClampedArray(pixels.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const index=(y*width+x)*4;
   output.set(pixels.subarray(index,index+4),(y*width+width-x-1)*4);
  }
  return output;
 };
 const retouch={turn:90,head:{x:.31,y:.43,rx:.13,ry:.19},headSize:87};
 const p={...project(),images:[{...image,color:{retouch}}]};
 const reflected=mirrorProjectImage(p,'a').images[0].color.retouch;
 const actual=applyPortraitRetouch(flip(source),reflected,frame);
 const expected=flip(applyPortraitRetouch(source.slice(),retouch,frame));
 assert.ok(actual.every((pixel,i)=>Math.abs(pixel-expected[i])<=1));
});
test('quarter turns preserve image centre, original asset, canvas, order and all layout memories',()=>{
 const p=project(),before=structuredClone(p),next=rotateProjectImage(p,'a',90);
 assert.deepEqual(next.positions.a,{x:70,y:10,width:80,height:160});assert.equal(next.images[0].rotation,90);assert.deepEqual([next.images[0].width,next.images[0].height],[40,80]);assert.deepEqual(next.layoutStates.free.a,{x:0,y:-10,width:40,height:80});assert.deepEqual(next.importSizes.a,{width:80,height:160});
 assert.deepEqual(next.canvas,p.canvas);assert.deepEqual(next.export,p.export);assert.deepEqual(next.initialOrder,p.initialOrder);assert.equal(next.images[0].assetId,image.assetId);assert.equal(next.images[0].bytes,image.bytes);assert.deepEqual(p,before);
 const back=rotateProjectImage(next,'a',-90);assert.deepEqual(back.positions,p.positions);assert.deepEqual(back.layoutStates,p.layoutStates);assert.equal(back.images[0].rotation,0);
 assert.equal(rotateProjectImage(p,'a',360),p);assert.throws(()=>rotateProjectImage(p,'a',45),/旋转/);assert.throws(()=>sourceWindow({...image,rotation:NaN}),/旋转/);
});
test('rotation maps independent crop edges, fractional axes and split windows without losing original pixels',()=>{
 const p={...project(),images:[{...image,width:30,height:20,source:{left:10,top:5,width:30,height:20,fullWidth:80,fullHeight:40}}],edits:{a:{edges:{left:1,top:2,right:3,bottom:4},links:{horizontal:true,vertical:false}}}};
 const next=rotateProjectImage(p,'a',90);assert.deepEqual(sourceWindow(next.images[0]),{left:15,top:10,width:20,height:30,fullWidth:40,fullHeight:80});assert.deepEqual(next.edits.a,{edges:{left:4,top:1,right:2,bottom:3},links:{horizontal:false,vertical:true}});assert.deepEqual(imageGeometry(next.images[0],next.edits.a),{left:4,top:1,width:14,height:26});
 const fractional=rotateProjectImage({...project(),edits:{a:{axis:'horizontal',fraction:.125}}},'a',90);assert.deepEqual(fractional.edits.a,{axis:'vertical',fraction:.125});
 const pieces=splitProjectImage(next,'a','x',7,['left','right']);assert.ok(pieces.images.every(i=>i.rotation===90));const turned=rotateProjectImage(pieces,'right',-90);assert.equal(turned.images[1].rotation,0);assert.equal(turned.images[1].assetId,image.assetId);assert.deepEqual(sourceWindow(turned.images[1]),{left:10,top:5,width:30,height:13,fullWidth:80,fullHeight:40});
});
test('real export rotates oriented source windows, invalidates square-image cache and keeps source bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-rotation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root),images=new ImageService(),service=new StitchService(store,images);
 const source=await sharp(Buffer.from('<svg width="8" height="4"><rect width="8" height="4" fill="red"/><rect x="4" width="4" height="4" fill="blue"/></svg>')).png().toBuffer(),item=await store.import(source,'original.png');delete item.preview;
 let p={...project(),images:[item],initialOrder:[item.id],positions:{[item.id]:{x:6,y:8,width:8,height:4}},edits:{},importSizes:undefined,layoutStates:undefined,canvas:{width:20,height:20}};
 p=rotateProjectImage(p,item.id,90);await store.save(p);const reopened=await store.load(p.id),r=await service.render(reopened),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer(),rotated=await sharp(source).rotate(90).ensureAlpha().raw().toBuffer({resolveWithObject:true}),expected=await sharp({create:{width:20,height:20,channels:4,background:'#00000000'}}).composite([{input:rotated.data,raw:rotated.info,left:8,top:6}]).raw().toBuffer();assert.ok(actual.equals(expected));assert.ok((await store.readAsset(item.assetId)).equals(source));
 const square=await store.import(await sharp(source).resize(8,8,{fit:'fill'}).png().toBuffer(),'square.png');delete square.preview;const a={...p,images:[square],initialOrder:[square.id],positions:{[square.id]:{x:6,y:6,width:8,height:8}}};const first=await service.render(a),flipped=await service.render(rotateProjectImage(a,square.id,180));assert.notEqual(first.token,flipped.token);assert.ok(!images.result(first.token).output.buffer.equals(images.result(flipped.token).output.buffer),'square rotation must not reuse stale encoded pixels');
});

test('EXIF, asymmetric crop and split source windows rotate from immutable original coordinates',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-rotation-window-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root),images=new ImageService(),service=new StitchService(store,images);
 const source=await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="#779944"/><rect x="30" y="10" width="25" height="20" fill="#cc4477"/></svg>')).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer(),item=await store.import(source,'oriented.jpg');delete item.preview;
 const piece={...item,width:20,height:40,source:{left:10,top:20,width:20,height:40,fullWidth:40,fullHeight:80}},base={...project(),images:[piece],initialOrder:[piece.id],positions:{[piece.id]:{x:18,y:9,width:14,height:32}},edits:{[piece.id]:{edges:{left:2,top:3,right:4,bottom:5},links:{horizontal:false,vertical:false}}},layoutStates:undefined,importSizes:undefined,canvas:{width:50,height:50}};
 const cut=await sharp(source).rotate().toColourspace('srgb').extract({left:12,top:23,width:14,height:32}).png().toBuffer();
 for(const angle of [90,180,270]){
  const p=rotateProjectImage(base,piece.id,angle),r=await service.render(p),actual=await sharp(images.result(r.token).output.buffer).ensureAlpha().raw().toBuffer(),turn=await sharp(cut).rotate(angle).ensureAlpha().raw().toBuffer({resolveWithObject:true}),position=p.positions[piece.id],expected=await sharp({create:{width:50,height:50,channels:4,background:'#00000000'}}).composite([{input:turn.data,raw:turn.info,left:position.x,top:position.y}]).raw().toBuffer();assert.ok(actual.equals(expected),String(angle));
 }
 assert.ok((await store.readAsset(item.assetId)).equals(source));
});

test('precise angles preserve source windows, crop and pose while normalizing finite input',async()=>{
 const {setProjectImageAngle,rotatedImageBounds}=await import('../engine/image-rotation.mjs');
 const p=project(),before=structuredClone(p),next=setProjectImageAngle(p,'a',12.3);
 assert.equal(next.images[0].angle,12.3);assert.deepEqual(next.positions,p.positions);assert.deepEqual(next.canvas,p.canvas);assert.deepEqual(next.export,p.export);assert.deepEqual(next.layoutStates,p.layoutStates);assert.deepEqual(p,before);
 assert.equal(setProjectImageAngle(next,'a',372.3).images[0].angle,12.3);assert.throws(()=>setProjectImageAngle(p,'a',NaN),/角度/);
 const bounds=rotatedImageBounds({x:30,y:50,width:160,height:80},90);assert.deepEqual(bounds,{x:70,y:10,width:80,height:160});
});
test('precise rotation export matches source crop then rotation, clips rotated overlap, and survives reload',async t=>{
 const {setProjectImageAngle}=await import('../engine/image-rotation.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-precise-rotation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root),images=new ImageService(),service=new StitchService(store,images);
 const source=await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="red"/><rect x="35" width="45" height="40" fill="blue"/></svg>')).png().toBuffer(),item=await store.import(source,'source.png');delete item.preview;
 const p={...project(),images:[item],positions:{[item.id]:{x:10,y:20,width:60,height:30}},initialOrder:[item.id],edits:{[item.id]:{edges:{left:5,top:3,right:15,bottom:7}}},layoutStates:undefined,importSizes:undefined,canvas:{width:100,height:100}};
 const next=setProjectImageAngle(p,item.id,33.3);await store.save(next);const reloaded=await store.load(next.id);assert.equal(reloaded.images[0].angle,33.3);
 const first=await service.render(p),result=await service.render(reloaded);assert.notEqual(first.token,result.token);
 const turned=await sharp(source).extract({left:5,top:3,width:60,height:30}).rotate(33.3,{background:'#00000000'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const expected=await sharp({create:{width:100,height:100,channels:4,background:'#00000000'}}).composite([{input:turned.data,raw:turned.info,left:Math.round(40-turned.info.width/2),top:Math.round(35-turned.info.height/2)}]).raw().toBuffer();
 const actual=await sharp(images.result(result.token).output.buffer).ensureAlpha().raw().toBuffer();assert.ok(actual.equals(expected));assert.ok((await store.readAsset(item.assetId)).equals(source));
 const outside={...next,positions:{[item.id]:{x:-45,y:30,width:40,height:40}}};const outsideResult=await service.render(setProjectImageAngle(outside,item.id,45)),pixels=await sharp(images.result(outsideResult.token).output.buffer).ensureAlpha().raw().toBuffer();assert.ok(pixels.some((v,i)=>i%4===3&&v),'rotated corner can enter the canvas even when its unrotated rectangle is outside');
});

test('splitting a precise rotated image keeps both pieces on the same rotated source plane',async()=>{
 const {setProjectImageAngle}=await import('../engine/image-rotation.mjs');
 const p=setProjectImageAngle(project(),'a',90),pieces=splitProjectImage(p,'a','x',40,['one','two']);
 assert.deepEqual(pieces.positions.one,{x:70,y:10,width:80,height:80});assert.deepEqual(pieces.positions.two,{x:70,y:90,width:80,height:80});
 assert.equal(pieces.images[0].angle,90);assert.equal(pieces.images[1].angle,90);
 assert.deepEqual(pieces.layoutStates.free.one,{x:0,y:-10,width:40,height:40});assert.deepEqual(pieces.layoutStates.free.two,{x:0,y:30,width:40,height:40});
});

test('rounding near the angle boundary always produces valid canonical metadata',async()=>{
 const {setProjectImageAngle,normalizeImageAngle}=await import('../engine/image-rotation.mjs');
 for(const angle of [179.99999,-180.00001,539.99999]){
  assert.equal(normalizeImageAngle(angle),-180);
  const next=setProjectImageAngle(project(),'a',angle);assert.equal(next.images[0].angle,-180);assert.doesNotThrow(()=>sourceWindow(next.images[0]));
 }
});

test('an odd source split retains the exact export plane after a precise right angle',async t=>{
 const {setProjectImageAngle}=await import('../engine/image-rotation.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-odd-rotated-split-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new ProjectStore(root);
 const item=await store.import(await sharp({create:{width:80,height:40,channels:4,background:'red'}}).png().toBuffer(),'red.png');delete item.preview;
 const p=setProjectImageAngle({...project(),images:[item],positions:{[item.id]:{x:60,y:80,width:80,height:40}},initialOrder:[item.id],edits:{},layoutStates:undefined,importSizes:undefined,canvas:{width:200,height:200}},item.id,90);
 const before=await composeProject(p,store),after=await composeProject(splitProjectImage(p,item.id,'x',1,['one','two']),store);
 assert.ok(after.data.equals(before.data),'splitting must not shift the rotated source by a pixel');
});

test('corner rotation follows pointer angle and Shift snaps the absolute angle to 15 degrees',async()=>{
 const {angleFromCornerDrag}=await import('../engine/image-rotation.mjs');
 assert.equal(angleFromCornerDrag(12,10,25,false),27);
 assert.equal(angleFromCornerDrag(12,10,25,true),30);
 assert.equal(angleFromCornerDrag(170,175,-175,false),-180);
 assert.equal(angleFromCornerDrag(-20,-50,-70,true),-45);
});
