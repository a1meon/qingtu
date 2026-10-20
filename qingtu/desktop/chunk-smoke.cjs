const {app,net}=require('electron');const fs=require('node:fs/promises');const {createReadStream}=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');const assert=require('node:assert/strict');const yaml=require('js-yaml');const {createHash}=require('node:crypto');const {NsisUpdater}=require('electron-updater');const {GiteeChunkProvider}=require('./chunk-provider.cjs');const {ChunkTransport}=require('./chunk-download.cjs');
(async()=>{
 await app.whenReady();const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-sdk-'));let server,transport;
 try{
  let base=process.env.QINGTU_CHUNK_FEED;
  if(base==='auto'){const {resolveUpdateFeed}=require('./update-source.cjs');base=(await resolveUpdateFeed(require('./update-source.json'),'win32','x64',async url=>{const r=await net.fetch(url);if(!r.ok)throw Error('Release API '+r.status);return r.json();})).url;}
  if(!base){
   const dir=path.resolve(process.env.QINGTU_CHUNK_DIR||'release/gitee-v043');
   server=http.createServer((req,res)=>{const name=path.basename(new URL(req.url,'http://local').pathname);const stream=createReadStream(path.join(dir,name));stream.on('error',()=>{res.writeHead(404);res.end();});stream.pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/`;
  }
  transport=await new ChunkTransport(path.join(root,'parts'),{fetcher:(url,options)=>net.fetch(url,options)}).start();
  const updater=new NsisUpdater({provider:'custom',url:base,updateProvider:GiteeChunkProvider,transport,channel:'latest'});
  // Keep this test's SDK cache inside its isolated temporary workspace.
  Object.defineProperty(updater.app,'baseCachePath',{value:root});
  // A previous-version fixture exercises the real SDK's update decision.
  updater.currentVersion=new updater.currentVersion.constructor(process.env.QINGTU_TEST_CURRENT_VERSION||'0.4.2');updater.forceDevUpdateConfig=true;updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.disableWebInstaller=true;
  const configPath=path.join(root,'app-update.yml');updater.updateConfigPath=configPath;await fs.writeFile(configPath,yaml.dump({updaterCacheDirName:'qingtu-test-'+path.basename(root)}));
  updater._testOnlyOptions={platform:'win32'};updater.setFeedURL({provider:'custom',url:base,updateProvider:GiteeChunkProvider,transport,channel:'latest'});
  let ready=0;updater.on('update-downloaded',()=>ready++);let last=-1;updater.on('download-progress',p=>{const n=Math.floor(p.percent/20);if(n>last){last=n;console.log('Download '+Math.floor(p.percent)+'%');}});
  const result=await updater.checkForUpdates();assert.equal(result.updateInfo.version,process.env.QINGTU_CHUNK_EXPECTED_VERSION||'0.4.3');assert.equal(ready,0);assert.equal(updater.disableDifferentialDownload,true);
  if(updater.currentVersion.version===result.updateInfo.version){assert.equal(result.downloadPromise,undefined);console.log(JSON.stringify({passed:true,currentVersion:result.updateInfo.version,noAutomaticDownload:true,source:base}));app.quit();return;}
  const [downloaded]=await updater.downloadUpdate();assert.equal(ready,1);
  const expected=result.updateInfo.files.find(f=>f.url.endsWith('.exe'));const hash=createHash('sha512');for await(const b of createReadStream(downloaded))hash.update(b);assert.equal(hash.digest('base64'),expected.sha512);assert.equal((await fs.stat(downloaded)).size,expected.size);
  console.log(JSON.stringify({passed:true,realNsisSdk:true,version:result.updateInfo.version,bytes:expected.size,sha512:expected.sha512,installationTriggered:false,source:base}));
  const cache=path.resolve(updater.downloadedUpdateHelper.cacheDir);
  if(path.dirname(cache)!==path.resolve(root)||path.basename(cache)!=='qingtu-test-'+path.basename(root))throw new Error('Unexpected SDK smoke cache path');
  await fs.rm(cache,{recursive:true,force:true});
 }finally{transport?.close();server?.close();await fs.rm(root,{recursive:true,force:true});}
 app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
