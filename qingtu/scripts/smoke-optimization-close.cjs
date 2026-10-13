const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-optimization-'));
 try{
  const sharp=(await import('sharp')).default;await sharp({create:{width:400,height:300,channels:4,background:'#7ab8dd80'}}).png().toFile(path.join(root,'source.png'));
  const run=spawnSync(require('electron'),['desktop/optimization-close-smoke.cjs'],{env:{...process.env,QINGTU_OPTIMIZATION_ROOT:root},encoding:'utf8',timeout:60000,windowsHide:true});
  if(run.error||run.status!==0)throw run.error||new Error(run.stdout+'\n'+run.stderr);
  const {ProjectStore}=await import('../engine/project-store.mjs'),store=new ProjectStore(path.join(root,'projects')),project=await store.load((await store.list())[0].id);
  assert.equal(project.images.length,2);assert.deepEqual(project.initialOrder,project.images.map(image=>image.id));assert.deepEqual(project.canvas,{width:1200,height:480});assert.ok(project.images.every(image=>project.edits[image.id].fraction>0));assert.ok((await store.readAsset(project.images[0].assetId)).equals(await fs.readFile(path.join(root,'source.png'))));
  for(const mode of ['export','import']){
   const next=spawnSync(require('electron'),['desktop/optimization-close-smoke.cjs'],{env:{...process.env,QINGTU_OPTIMIZATION_ROOT:root,QINGTU_OPTIMIZATION_MODE:mode},encoding:'utf8',timeout:60000,windowsHide:true});
   if(next.error||next.status!==0)throw next.error||new Error(next.stdout+'\n'+next.stderr);
  }
  const exports=await fs.readdir(path.join(root,'exports'));assert.equal(exports.length,1);const exported=path.join(root,'exports',exports[0]),metadata=await sharp(exported).metadata();assert.deepEqual([metadata.width,metadata.height],[1200,480]);assert.ok((await fs.stat(exported)).size<=10000000);
  const extended=await store.load(project.id);assert.equal(extended.images.length,3);assert.deepEqual(extended.initialOrder,extended.images.map(image=>image.id));assert.deepEqual(extended.images.slice(0,2),project.images);assert.deepEqual([extended.images[2].width,extended.images[2].height],[400,300]);
  const result={passed:true,...JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8')),cropAndOriginalOrderReopened:true,sourceRetained:true,busyExportRetryAndCloseKeepsSavedFile:true,busyImportRetryAndCloseKeepsOriginal:true};
  await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/optimization-close-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
  const resolved=path.resolve(root);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('qingtu-optimization-'))throw new Error('Unsafe temporary cleanup');
  await fs.rm(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
