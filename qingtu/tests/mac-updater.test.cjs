const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const {MacUpdater}=require('../desktop/mac-updater.cjs');
const hash=b=>createHash('sha512').update(b).digest('base64');
async function fixture(t,{minimumSystemVersion,options={}}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-mac-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const {publicKey,privateKey}=generateKeyPairSync('ed25519');const bytes=Buffer.from('an authenticated mac archive');
 const manifest={version:'0.4.4',arch:'arm64',...(minimumSystemVersion===undefined?{}:{minimumSystemVersion}),file:{url:'Qingtu-0.4.4-mac-arm64.zip',size:bytes.length,sha512:hash(bytes),edSignature:sign(null,bytes,privateKey).toString('base64'),qingtuParts:[{url:'archive.part01',size:bytes.length,sha512:hash(bytes)}]}};const payload=Buffer.from(JSON.stringify(manifest));let envelope={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};let partHits=0,broken=false;const requests=[];
 const server=http.createServer((req,res)=>{requests.push(req.url);if(req.url.startsWith('/mac-'))res.end(JSON.stringify(envelope));else{partHits++;res.end(broken?Buffer.from('bad'):bytes);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/`;
 const calls=[];const updater=new MacUpdater({version:'0.4.3',arch:'arm64',publicKey:publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'),cacheRoot:root,native:{install:o=>calls.push(o)},...options});updater.setFeedURL({url:base});return{updater,calls,bytes,manifest,requests,get hits(){return partHits;},tamper:()=>envelope.payload=Buffer.from(JSON.stringify({...manifest,version:'0.4.5'})).toString('base64'),break:()=>broken=true};
}
test('checks authenticate metadata, never download; confirmed download stages exact bytes; native install waits for restart',async t=>{
 const f=await fixture(t);let available,ready;f.updater.on('update-available',i=>available=i);f.updater.on('update-downloaded',i=>ready=i);
 await f.updater.checkForUpdates();assert.equal(available.version,'0.4.4');assert.equal(f.hits,0);assert.equal(f.calls.length,0);
 const [file]=await f.updater.downloadUpdate();assert.deepEqual(await fs.readFile(file),f.bytes);assert.equal(ready.version,'0.4.4');assert.equal(f.calls.length,0);
 await f.updater.quitAndInstall(true,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].file.edSignature,f.manifest.file.edSignature);assert.match(f.calls[0].feedUrl,/127\.0\.0\.1/);f.updater.close();
});
test('bridge uses an independent authenticated channel and refuses unsupported macOS before downloading',async t=>{
 const f=await fixture(t,{minimumSystemVersion:'13.3',options:{channel:'mac-light',systemVersion:'13.2.1'}});
 await assert.rejects(f.updater.checkForUpdates(),e=>e.code==='UPDATE_OS_UNSUPPORTED'&&/13.3/.test(e.message));
 assert.deepEqual(f.requests,['/mac-light-arm64.json']);assert.equal(f.hits,0);assert.equal(f.updater.manifest,null);
 await assert.rejects(f.updater.downloadUpdate(),/先检查/);assert.equal(f.calls.length,0);
});
test('supported bridge keeps minimum OS in the local Sparkle feed and stages exact authenticated bytes',async t=>{
 const f=await fixture(t,{minimumSystemVersion:'13.3',options:{channel:'mac-light',systemVersion:'13.3.0'}});
 await f.updater.checkForUpdates();await f.updater.downloadUpdate();await f.updater.quitAndInstall();
 const appcast=await(await fetch(f.calls[0].feedUrl)).text();assert.match(appcast,/<sparkle:minimumSystemVersion>13\.3<\/sparkle:minimumSystemVersion>/);f.updater.close();
});
test('bridge cannot accept missing/malformed OS requirements or an unknown local system version',async t=>{
 for(const minimumSystemVersion of [undefined,'13.3junk','0.0','13.3.0.1']){
  const f=await fixture(t,{minimumSystemVersion,options:{channel:'mac-light',systemVersion:'14.0'}});
  await assert.rejects(f.updater.checkForUpdates(),/系统版本/);assert.equal(f.hits,0);
 }
 const f=await fixture(t,{minimumSystemVersion:'13.3',options:{channel:'mac-light',systemVersion:''}});
 await assert.rejects(f.updater.checkForUpdates(),/系统版本/);assert.equal(f.hits,0);
});
test('a changed manifest cannot announce an update or fetch executable bytes',async t=>{const f=await fixture(t);f.tamper();await assert.rejects(f.updater.checkForUpdates(),/签名/);assert.equal(f.hits,0);});
test('wrong architecture, already-current version and incomplete download cannot launch installer',async t=>{
 const f=await fixture(t);await assert.rejects(f.updater.quitAndInstall(),/下载/);f.updater.arch='x64';await assert.rejects(f.updater.checkForUpdates(),/架构/);f.updater.arch='arm64';f.updater.version='0.4.4';let current=false;f.updater.on('update-not-available',()=>current=true);await f.updater.checkForUpdates();assert.equal(current,true);assert.equal(f.hits,0);
 f.updater.version='0.4.3';await f.updater.checkForUpdates();f.break();await assert.rejects(f.updater.downloadUpdate(),/校验|体积/);assert.equal(f.calls.length,0);
});
