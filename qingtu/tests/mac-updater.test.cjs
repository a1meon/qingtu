const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const {MacUpdater}=require('../desktop/mac-updater.cjs');
const hash=b=>createHash('sha512').update(b).digest('base64');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-mac-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=Buffer.from('an authenticated mac archive');
 const manifest={version:'0.4.4',arch:'arm64',file:{url:'Qingtu-0.4.4-mac-arm64.zip',size:bytes.length,sha512:hash(bytes),edSignature:sign(null,bytes,privateKey).toString('base64'),qingtuParts:[{url:'archive.part01',size:bytes.length,sha512:hash(bytes)}]}};const payload=Buffer.from(JSON.stringify(manifest));let envelope={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};let partHits=0,broken=false;
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/mac-'))res.end(JSON.stringify(envelope));else{partHits++;res.end(broken?Buffer.from('bad'):bytes);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/`;
 const calls=[];const updater=new MacUpdater({version:'0.4.3',arch:'arm64',publicKey:publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'),cacheRoot:root,native:{install:o=>calls.push(o)}});updater.setFeedURL({url:base});return{updater,calls,bytes,manifest,get hits(){return partHits;},tamper:()=>envelope.payload=Buffer.from(JSON.stringify({...manifest,version:'0.4.5'})).toString('base64'),break:()=>broken=true};
}
test('checks authenticate metadata, never download; confirmed download stages exact bytes; native install waits for restart',async t=>{
 const f=await fixture(t);let available,ready;f.updater.on('update-available',i=>available=i);f.updater.on('update-downloaded',i=>ready=i);
 await f.updater.checkForUpdates();assert.equal(available.version,'0.4.4');assert.equal(f.hits,0);assert.equal(f.calls.length,0);
 const [file]=await f.updater.downloadUpdate();assert.deepEqual(await fs.readFile(file),f.bytes);assert.equal(ready.version,'0.4.4');assert.equal(f.calls.length,0);
 await f.updater.quitAndInstall(true,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].file.edSignature,f.manifest.file.edSignature);assert.match(f.calls[0].feedUrl,/127\.0\.0\.1/);f.updater.close();
});
test('a changed manifest cannot announce an update or fetch executable bytes',async t=>{const f=await fixture(t);f.tamper();await assert.rejects(f.updater.checkForUpdates(),/签名/);assert.equal(f.hits,0);});
test('wrong architecture, already-current version and incomplete download cannot launch installer',async t=>{
 const f=await fixture(t);await assert.rejects(f.updater.quitAndInstall(),/下载/);f.updater.arch='x64';await assert.rejects(f.updater.checkForUpdates(),/架构/);f.updater.arch='arm64';f.updater.version='0.4.4';let current=false;f.updater.on('update-not-available',()=>current=true);await f.updater.checkForUpdates();assert.equal(current,true);assert.equal(f.hits,0);
 f.updater.version='0.4.3';await f.updater.checkForUpdates();f.break();await assert.rejects(f.updater.downloadUpdate(),/校验|体积/);assert.equal(f.calls.length,0);
});

test('Mac verifies mirror manifests, pins their version and tries the other host for damaged parts',async t=>{
 const f=await fixture(t);
 const healthy=f.updater.feed.url,primary='https://primary.test/v0.4.4/';
 let damagedManifest=true;const hits=[];
 f.updater.fetcher=async(url,options)=>{
  hits.push(url);
  if(url.startsWith(primary)){
   if(url.endsWith('.json')&&!damagedManifest)return fetch(new URL('mac-arm64.json',healthy),options);
   return new Response(url.endsWith('.json')?'{"signature":"bad"}':'broken');
  }
  return fetch(url,options);
 };
 f.updater.setFeedURL({url:primary,mirrorUrls:[healthy],releaseVersion:'0.4.5'});
 await assert.rejects(f.updater.checkForUpdates());assert.equal(f.hits,0);
 f.updater.setFeedURL({url:primary,mirrorUrls:[healthy],releaseVersion:'0.4.4'});
 await f.updater.checkForUpdates();assert.equal(f.updater.sources[0],healthy);
 damagedManifest=false;await f.updater.checkForUpdates();assert.equal(f.updater.sources[0],primary);
 const [result]=await f.updater.downloadUpdate();assert.deepEqual(await fs.readFile(result),f.bytes);
 assert.deepEqual(hits.slice(-2),[primary+'archive.part01',healthy+'archive.part01']);
});
