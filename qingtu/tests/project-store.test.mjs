import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ProjectStore} from '../engine/project-store.mjs';
import {optimizeHorizontal} from '../engine/stitch-optimize.mjs';
import {recordImportOrder,resetProject} from '../engine/stitch-reset.mjs';
import {rememberCanvasLayout,switchCanvasLayout} from '../engine/canvas-layout-state.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {importCanvasImages} from '../engine/canvas-import.mjs';
const fixture=()=>sharp({create:{width:80,height:60,channels:4,background:'#7799aa80'}}).png().toBuffer();
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-project-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:new ProjectStore(root)};}
const project=image=>({id:'test-project',name:'测试',images:[image],layout:'horizontal',positions:{},grid:{rows:1,columns:1},export:{longEdge:5999,format:'png',targetBytes:10000000}});

test('import-size baselines survive reopen and atomic backup recovery without capturing enlarged poses',async t=>{
 const {root,store}=await setup(t),bytes=await fixture(),image=await store.import(bytes,'initial.png');delete image.preview;
 let p=importCanvasImages({...project(image),images:[],initialOrder:[],canvasMode:'fixed',heightLocked:true,canvasSizing:'content',canvas:{width:600,height:240},positions:{},edits:{}},[image]);
 p={...p,layout:'free',canvasSizing:'manual',canvas:{width:600,height:480},positions:{[image.id]:{x:100,y:20,width:480,height:600}}};await store.save(p);
 const reopened=await new ProjectStore(root).load(p.id);assert.deepEqual(reopened.importSizes,{[image.id]:{width:320,height:240}});assert.deepEqual(resetProject(reopened).positions[image.id],{x:180,y:200,width:320,height:240});
 assert.throws(()=>store.save({...p,importSizes:{[image.id]:{width:0,height:240}}}),/导入尺寸/);assert.deepEqual((await store.load(p.id)).positions,p.positions);
 await store.save({...p,name:'later'});await fs.writeFile(store.file(p.id),'interrupted');const recovered=await new ProjectStore(root).load(p.id);assert.equal(recovered.recovered,true);assert.deepEqual(recovered.importSizes,p.importSizes);assert.deepEqual(resetProject(recovered).positions,resetProject(reopened).positions);assert.ok((await store.readAsset(image.assetId)).equals(bytes));
});

test('height policy, all four crop edges and association choices survive normal and interrupted saves',async t=>{
 const {store}=await setup(t),buffer=await fixture(),image=await store.import(buffer,'portrait.png');delete image.preview;
 let p={...project(image),canvasMode:'fixed',heightLocked:true,canvasSizing:'content',canvas:{width:80,height:60},positions:{[image.id]:{x:0,y:0,width:80,height:60}},edits:{}};
 p=rememberCanvasLayout(setImageEdit(p,image.id,{edges:{left:3,top:8,right:5,bottom:2},links:{horizontal:false,vertical:true}}));await store.save(p);
 const reopened=await new ProjectStore(store.root).load(p.id);assert.equal(reopened.heightLocked,true);assert.deepEqual(reopened.edits,p.edits);assert.deepEqual(reopened.positions,p.positions);assert.deepEqual(reopened.canvas,p.canvas);
 await store.save({...p,name:'later'});await fs.writeFile(store.file(p.id),'interrupted');const recovered=await store.load(p.id);assert.equal(recovered.recovered,true);assert.deepEqual(recovered.edits,p.edits);assert.deepEqual(recovered.layoutCanvases,p.layoutCanvases);assert.ok((await store.readAsset(image.assetId)).equals(buffer));
 assert.throws(()=>store.save({...p,heightLocked:'yes'}),/高度设置/);
});
test('original copies and complete edit states survive moved sources and a fresh store',async t=>{
 const {root,store}=await setup(t),source=path.join(root,'original.png'),buffer=await fixture();await fs.writeFile(source,buffer);
 const image=await store.import(await fs.readFile(source),'original.png');delete image.preview;const p=project(image);p.positions[image.id]={x:10,y:-2,width:800};p.crops={[image.id]:null};p.canvas={width:5999,height:4499};p.edits={[image.id]:{axis:'vertical',amount:5}};
 p.thumbnail='data:image/png;base64,'+buffer.toString('base64');await store.save(p);await fs.rename(source,path.join(root,'moved.png'));
 const reopened=new ProjectStore(root),restored=await reopened.load(p.id);assert.deepEqual(restored.images,p.images);assert.deepEqual(restored.positions,p.positions);assert.deepEqual(restored.export,p.export);assert.deepEqual(restored.canvas,p.canvas);
 assert.ok((await reopened.readAsset(image.assetId)).equals(buffer));assert.equal((await reopened.list()).length,1);
 assert.equal(restored.thumbnail,p.thumbnail);assert.equal((await reopened.list())[0].thumbnail,p.thumbnail);
 assert.deepEqual(restored.edits,p.edits);
});
test('corrupt newest data recovers the prior committed generation and ignores partial temporary files',async t=>{
 const {store}=await setup(t),image=await store.import(await fixture(),'a.png');delete image.preview;const p=project(image);await store.save(p);
 await store.save({...p,name:'新版'});await fs.writeFile(store.file(p.id),'broken');await fs.writeFile(store.file(p.id,'.interrupted.tmp'),'{');
 const restored=await store.load(p.id);assert.equal(restored.name,'测试');assert.equal(restored.recovered,true);assert.equal((await store.list()).length,1);
 await store.save({...restored,name:'重试成功'});const retried=await store.load(p.id);assert.equal(retried.name,'重试成功');assert.equal(retried.recovered,undefined,'a successful retry clears transient recovery state');
});
test('failed persistence never replaces an existing project or reports saved success',async t=>{
 const {store}=await setup(t),image=await store.import(await fixture(),'a.png');delete image.preview;const p=project(image);await store.save(p);
 const bad={...p,images:[{...image,assetId:'a'.repeat(64)}]};await assert.rejects(store.save(bad));assert.equal((await store.load(p.id)).images[0].assetId,image.assetId);
 await store.save({...p,name:'恢复写入'});assert.equal((await store.load(p.id)).name,'恢复写入');
});
test('independent projects share copied assets safely and deleting never removes original files',async t=>{
 const {root,store}=await setup(t),source=path.join(root,'user-original.png'),buffer=await fixture();await fs.writeFile(source,buffer);
 const image=await store.import(buffer,'a.png');delete image.preview;const p=project(image);await store.save(p);await store.save({...p,id:'second',export:{...p.export,format:'jpeg'}});
 await store.remove(p.id);assert.ok((await store.readAsset(image.assetId)).equals(buffer));assert.equal((await store.load('second')).export.format,'jpeg');
 await store.remove('second');assert.ok((await fs.readFile(source)).equals(buffer));assert.equal((await store.list()).length,0);
});
test('project and asset identifiers cannot escape the private storage directory',async t=>{
 const {store}=await setup(t);await assert.rejects(store.load('../outside'));await assert.rejects(store.readAsset('../outside'));assert.throws(()=>store.save({id:'../outside',images:[]}));
});
test('atomic project backups restore the complete percentage-crop generation after an interrupted save',async t=>{
 const {root,store}=await setup(t),source=await sharp(await fixture()).resize(800,600).png().toBuffer(),image=await store.import(source,'a.png');delete image.preview;
 const p={...project(image),images:[image,{...image,id:'second-image'},{...image,id:'third-image'}]};
 const optimized=optimizeHorizontal(p);await store.save(optimized);await store.save({...optimized,name:'新名称'});
 await fs.writeFile(store.file(p.id),'interrupted');await fs.writeFile(store.file(p.id,'.partial.tmp'),'{');
 const restored=await new ProjectStore(root).load(p.id);assert.equal(restored.recovered,true);assert.deepEqual(restored.edits,optimized.edits);assert.deepEqual(restored.edits['second-image'].edges,{left:100,right:100,top:90,bottom:0});assert.deepEqual(restored.export,optimized.export);assert.deepEqual(restored.images,p.images);assert.ok((await store.readAsset(image.assetId)).equals(source));
});

test('optimization parameters remain independent per project and survive interrupted saves',async t=>{
 const {root,store}=await setup(t),source=await sharp(await fixture()).resize(800,600).png().toBuffer(),image=await store.import(source,'options.png');delete image.preview;
 const a={...project(image),id:'settings-a',optimization:{topPercent:12.5,sidePixels:120,imageNumber:4}},b={...project(image),id:'settings-b',optimization:{topPercent:30,sidePixels:50,imageNumber:null}};
 await store.save(a);await store.save(b);await store.save({...a,optimization:{topPercent:20,sidePixels:100}});
 await fs.writeFile(store.file(a.id),'interrupted');const reopened=new ProjectStore(root),restored=await reopened.load(a.id);
 assert.equal(restored.recovered,true);assert.deepEqual(restored.optimization,a.optimization);assert.deepEqual((await reopened.load(b.id)).optimization,b.optimization);assert.ok((await reopened.readAsset(image.assetId)).equals(source));
 for(const optimization of [{topPercent:100,sidePixels:100},{topPercent:25,sidePixels:-1},'bad'])assert.throws(()=>store.save({...b,optimization}),/裁剪|设置/);
});

test('per-image multi-crop parameters and disabled selections survive independent projects and interrupted saves',async t=>{
 const {root,store}=await setup(t),source=await fixture(),image=await store.import(source,'multi-options.png');delete image.preview;
 const a={...project(image),id:'multi-settings-a',optimization:{specialCrops:{[image.id]:{enabled:true,topPercent:12.5,sidePixels:40}}}},b={...project(image),id:'multi-settings-b',optimization:{specialCrops:{[image.id]:{enabled:false,topPercent:8,sidePixels:10}}}};
 assert.throws(()=>store.save({...a,optimization:{specialCrops:{[image.id]:{enabled:true,topPercent:100,sidePixels:40}}}}),/裁剪/);
 await store.save(a);await store.save(b);await store.save({...a,optimization:{specialCrops:{}}});await fs.writeFile(store.file(a.id),'interrupted');
 const reopened=new ProjectStore(root),restored=await reopened.load(a.id);assert.equal(restored.recovered,true);assert.deepEqual(restored.optimization,a.optimization);assert.deepEqual((await reopened.load(b.id)).optimization,b.optimization);assert.ok((await reopened.readAsset(image.assetId)).equals(source));
});
test('true import order survives reorder and crash recovery; invalid orders cannot replace a manifest',async t=>{
 const {root,store}=await setup(t),image=await store.import(await fixture(),'first.png');delete image.preview;
 const second={...image,id:'second'},p=recordImportOrder({...project(image),images:[second,image]},[image.id,second.id]);
 await store.save(p);assert.throws(()=>store.save({...p,initialOrder:[second.id,second.id]}),/顺序/);
 await store.save({...p,name:'新版'});await fs.writeFile(store.file(p.id),'interrupted');
 const restored=await new ProjectStore(root).load(p.id);assert.deepEqual(restored.initialOrder,p.initialOrder);assert.deepEqual(resetProject(restored).images,[image,second]);
});
test('atomic recovery retains fixed canvas, off-canvas transforms and independent dimensions',async t=>{
 const {root,store}=await setup(t),image=await store.import(await fixture(),'fixed.png');delete image.preview;
 const p={...project(image),canvasMode:'fixed',canvas:{width:5995,height:2398},initialOrder:[image.id],positions:{[image.id]:{x:-120.5,y:2600,width:800,height:300}}};
 await store.save(p);await store.save({...p,canvas:{width:2000,height:1000}});await fs.writeFile(store.file(p.id),'interrupted');const restored=await new ProjectStore(root).load(p.id);
 assert.equal(restored.recovered,true);assert.deepEqual(restored.canvas,p.canvas);assert.deepEqual(restored.positions,p.positions);assert.ok((await store.readAsset(image.assetId)).equals(await fixture()));
 assert.throws(()=>store.save({...p,positions:{[image.id]:{x:0,y:0,width:800,height:NaN}}}),/位置或尺寸/);
 await store.save({...p,canvas:{width:6000,height:2000}});assert.deepEqual((await store.load(p.id)).canvas,{width:6000,height:2000},'invalid user settings remain recoverable while layout validation blocks export');
});
test('layout memories survive a normal reload and atomic recovery without dropping manual transforms',async t=>{
 const {store}=await setup(t),image=await store.import(await fixture(),'memory.png');delete image.preview;
 let p={...project(image),canvasMode:'fixed',canvas:{width:600,height:240},positions:{[image.id]:{x:-20,y:30,width:320,height:200}}};
 p=switchCanvasLayout(p,'free');p.positions={[image.id]:{x:400,y:-80,width:120,height:300}};p=rememberCanvasLayout(p);await store.save(p);
 const reopened=await new ProjectStore(store.root).load(p.id);assert.deepEqual(reopened.layoutStates,p.layoutStates);assert.deepEqual(reopened.layoutCanvases,p.layoutCanvases);assert.deepEqual(switchCanvasLayout(reopened,'horizontal').positions,{[image.id]:{x:-20,y:30,width:320,height:200}});
 await store.save({...p,name:'later'});await fs.writeFile(store.file(p.id),'interrupted');const recovered=await store.load(p.id);assert.equal(recovered.recovered,true);assert.deepEqual(recovered.layoutStates,p.layoutStates);assert.deepEqual(recovered.layoutCanvases,p.layoutCanvases);
 assert.throws(()=>store.save({...p,layoutStates:{free:{[image.id]:{x:NaN,y:0,width:1,height:1}}}}),/布局记忆/);assert.deepEqual((await store.load(p.id)).layoutStates,p.layoutStates);
});

test('new imports and reopened canvas layers retain enough pixels for a 750px Retina preview before composition',async t=>{
 const {root,store}=await setup(t),width=1500,height=1000,raw=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=(y*width+x)*4;raw[offset]=x%2?255:0;raw[offset+1]=y%2?255:0;raw[offset+2]=128;raw[offset+3]=255;}
 const source=await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer(),image=await store.import(source,'fine-lines.png');
 for(const preview of [image.preview,await new ProjectStore(root).preview(image.assetId)]){
  const {data,info}=await sharp(Buffer.from(preview.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height],[1500,1000],'the initial layer must not enlarge a thumbnail while composition runs');assert.ok(data.equals(raw),'one-pixel lines survive before the processed preview is ready');
 }
 assert.ok((await store.readAsset(image.assetId)).equals(source));
});

test('stitch editor previews stay bounded, orient sources correctly and never upscale small originals',async t=>{
 const {store}=await setup(t);
 for(const [width,height,orientation,want] of [[4000,3000,1,[1600,1200]],[3000,4000,1,[900,1200]],[4000,3000,6,[900,1200]],[80,60,1,[80,60]]]){
  const source=await sharp({create:{width,height,channels:3,background:'#7799aa'}}).jpeg().withMetadata({orientation}).toBuffer(),image=await store.import(source,'oriented.jpg'),meta=await sharp(Buffer.from(image.preview.split(',')[1],'base64')).metadata();
  assert.deepEqual([meta.width,meta.height],want);assert.ok((await store.readAsset(image.assetId)).equals(source));
 }
});

test('a valid backup remains discoverable when the primary is invalid, mismatched or absent',async t=>{
 const {store}=await setup(t),image=await store.import(await fixture(),'source.png');
 const value=project(image);await store.save(value);await store.save({...value,name:'later'});
 for(const invalid of [{...value,images:null},{...value,id:'other-project'},null]){
  if(invalid)await fs.writeFile(store.file(value.id),JSON.stringify(invalid));else await fs.unlink(store.file(value.id));
  const recovered=await store.load(value.id);
  assert.equal(recovered.id,value.id);assert.equal(recovered.recovered,true);assert.equal(recovered.name,value.name);
  const list=await store.list();assert.equal(list.length,1);assert.equal(list[0].id,value.id);
 }
});

test('an external color reference can be profiled without writing a canvas asset', async t => {
 const {root,store}=await setup(t),source=await fixture();
 const reference=await store.import(source,'reference.png',{reference:true});
 assert.deepEqual([reference.name,reference.width,reference.height],['reference.png',80,60]);
 assert.ok(reference.preview.startsWith('data:image/png;base64,'));
 assert.equal(reference.assetId,undefined);
 await assert.rejects(fs.readdir(path.join(root,'assets')), {code:'ENOENT'});
 const image=await store.import(source,'canvas.png');delete image.preview;
 const colorReference={name:reference.name,thumbnail:reference.preview,statistics:{mean:[.5,.03,-.1],deviation:[.02,.03,.01]}};
 const p={...project(image),colorReference};
 await store.save(p);
 assert.deepEqual((await new ProjectStore(root).load(p.id)).colorReference,colorReference);
 assert.throws(()=>store.save({...p,colorReference:{...colorReference,statistics:{mean:[],deviation:[]}}}),/参考图数据/);
});
