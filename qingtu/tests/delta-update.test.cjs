const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {createHash,randomBytes}=require('node:crypto');
const yaml=require('js-yaml');
const {splitRelease}=require('../scripts/prepare-chunk-release.cjs');
const {assembleParts,ChunkTransport}=require('../desktop/chunk-download.cjs');

const digest=bytes=>createHash('sha512').update(bytes).digest('base64');
test('published update uses only the patch over HTTP, with verified recovery paths',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-patch-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const original=randomBytes(384*1024),next=Buffer.concat([randomBytes(208),original,randomBytes(31)]);
 const old=path.join(dir,'Qingtu-1.0.0-win-x64.exe'),name='Qingtu-1.0.1-win-x64.exe';
 const feedDir=path.join(dir,'feed'),meta=path.join(dir,'latest.yml');
 await fs.writeFile(old,original);await fs.writeFile(path.join(dir,name),next);
 await fs.writeFile(meta,yaml.dump({version:'1.0.1',files:[{url:name,size:next.length,sha512:digest(next)}]}));
 const published=await splitRelease(meta,feedDir,128*1024);
 const [file]=yaml.load(await fs.readFile(published.metadata)).files;
 const patch=file.qingtuDelta;
 assert.ok(patch.size<next.length/2);assert.ok(published.artifacts.includes(patch.url));
 const downloaded=[];let responseStatus=200,patchBytes=await fs.readFile(path.join(feedDir,patch.url));
 const server=http.createServer(async(req,res)=>{
  const name=path.basename(req.url);downloaded.push(name);
  if(name===patch.url){res.writeHead(responseStatus);res.end(patchBytes);}
  else{res.end(await fs.readFile(path.join(feedDir,name)));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/',parts=file.qingtuParts.map(p=>p.url);
 await t.test('an updater with a cached baseline serves an identical installer and keeps the new base',async()=>{
  const root=path.join(dir,'cache'),cached=path.join(root,Buffer.from(patch.baseSha512,'base64').toString('hex'));
  await fs.mkdir(cached,{recursive:true});await fs.copyFile(old,path.join(cached,'complete'));
  const transport=await new ChunkTransport(root).start();
  try{
   const progress=[];
   const route=transport.register(file,url,(bytes,total,mode)=>progress.push({bytes,total,mode}));
   assert.deepEqual(Buffer.from(await(await fetch(route)).arrayBuffer()),next);
   assert.deepEqual(downloaded.splice(0),[patch.url]);
   assert.deepEqual(progress.at(-1),{bytes:patch.size,total:patch.size,mode:'delta'});
   assert.deepEqual(await fs.readFile(await assembleParts(file,url,root)),next);
   assert.deepEqual(downloaded,[]);
  }finally{transport.close();}
 });
 await t.test('a damaged primary patch retrieves only the verified patch from the same-tag mirror',async()=>{
  const primary='https://primary.test/v1.0.1/', attempts=[];
  const result=await assembleParts(file,primary,path.join(dir,'mirror'),{baseFiles:[old],mirrorUrls:[url],fetcher:(location,options)=>{
   attempts.push(location);return location.startsWith(primary)?new Response('bad'):fetch(location,options);
  }});
  assert.deepEqual(await fs.readFile(result),next);
  assert.deepEqual(attempts,[primary+patch.url,url+patch.url]);assert.deepEqual(downloaded.splice(0),[patch.url]);
 });
 await t.test('a missing or same-size damaged base downloads full parts without requesting a patch',async()=>{
  const damaged=path.join(dir,'damaged');await fs.writeFile(damaged,Buffer.alloc(original.length));
  const result=await assembleParts(file,url,path.join(dir,'no-base'),{baseFiles:[damaged]});
  assert.deepEqual(await fs.readFile(result),next);assert.deepEqual(downloaded.splice(0),parts);
 });
 await t.test('a missing or corrupt patch falls back and never stages the invalid result',async()=>{
  const good=patchBytes;
  for(const mode of ['missing','badHash','badCopy']){
   responseStatus=mode==='missing'?404:200;patchBytes=Buffer.from(good);patchBytes.writeUInt32LE(0xfffffffe,4);
   const descriptor=mode==='badCopy'?{...file,qingtuDelta:{...patch,sha512:digest(patchBytes)}}:file;
   const result=await assembleParts(descriptor,url,path.join(dir,mode),{baseFiles:[old]});
   assert.deepEqual(await fs.readFile(result),next);assert.deepEqual(downloaded.splice(0),[patch.url,...parts]);
  }
  patchBytes=good;responseStatus=200;
 });
 await t.test('transient network failure does not turn a small retry into a full download',async()=>{
  responseStatus=503;const root=path.join(dir,'transient');
  await assert.rejects(assembleParts(file,url,root,{baseFiles:[old]}),/下载失败/);
  assert.deepEqual(downloaded.splice(0),[patch.url]);responseStatus=200;
  assert.deepEqual(await fs.readFile(await assembleParts(file,url,root,{baseFiles:[old]})),next);
  assert.deepEqual(downloaded.splice(0),[patch.url]);
 });
 await t.test('cancelling the patch transfer keeps the base intact and retries only the patch',async()=>{
  const root=path.join(dir,'cancel'),abort=new AbortController();
  await assert.rejects(assembleParts(file,url,root,{
   baseFiles:[old],signal:abort.signal,
   onProgress(bytes,total,mode){if(mode==='delta'&&bytes>0)abort.abort();}
  }),{name:'AbortError'});
  const targetDir=path.join(root,Buffer.from(file.sha512,'base64').toString('hex'));
  assert.deepEqual(await fs.readdir(targetDir),[]);
  assert.equal(digest(await fs.readFile(old)),patch.baseSha512);
  assert.deepEqual(downloaded.splice(0),[patch.url]);
  assert.deepEqual(await fs.readFile(await assembleParts(file,url,root,{baseFiles:[old]})),next);
  assert.deepEqual(downloaded.splice(0),[patch.url]);
 });
 await t.test('unsupported patch metadata keeps the old full-download protocol working',async()=>{
  const info={...file,qingtuDelta:{...patch,url:'../outside.qtdelta'}};
  assert.deepEqual(await fs.readFile(await assembleParts(info,url,path.join(dir,'unsafe'),{baseFiles:[old]})),next);
  assert.deepEqual(downloaded.splice(0),parts);
 });
});
