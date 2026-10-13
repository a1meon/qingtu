import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ProjectStore} from '../engine/project-store.mjs';
import {optimizeHorizontal} from '../engine/stitch-optimize.mjs';
const fixture=()=>sharp({create:{width:80,height:60,channels:4,background:'#7799aa80'}}).png().toBuffer();
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-project-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:new ProjectStore(root)};}
const project=image=>({id:'test-project',name:'测试',images:[image],layout:'horizontal',positions:{},grid:{rows:1,columns:1},export:{longEdge:5999,format:'png',targetBytes:10000000}});
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
 const {root,store}=await setup(t),image=await store.import(await fixture(),'a.png');delete image.preview;
 const p={...project(image),images:[image,{...image,id:'second-image'},{...image,id:'third-image'}]};
 const optimized=optimizeHorizontal(p);await store.save(optimized);await store.save({...optimized,name:'新名称'});
 await fs.writeFile(store.file(p.id),'interrupted');await fs.writeFile(store.file(p.id,'.partial.tmp'),'{');
 const restored=await new ProjectStore(root).load(p.id);assert.equal(restored.recovered,true);assert.deepEqual(restored.edits,optimized.edits);assert.deepEqual(restored.export,optimized.export);assert.deepEqual(restored.images,p.images);assert.ok((await store.readAsset(image.assetId)).equals(await fixture()));
});
