// Owned, hidden fixture bundles only. Never launch/replace /Applications or a user's app.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{createReadStream}=require('node:fs'),{spawn,execFileSync}=require('node:child_process'),asar=require('@electron/asar');
const {writeMacChannel}=require('./prepare-legacy-update.cjs');
const root=path.resolve('artifacts/legacy-migration'),version=require('../package.json').version;
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'pipe'});
const plist=(app,key,type,value)=>{try{run('/usr/libexec/PlistBuddy',['-c',`Delete :${key}`,path.join(app,'Contents/Info.plist')]);}catch{}run('/usr/libexec/PlistBuddy',['-c',`Add :${key} ${type} ${value}`,path.join(app,'Contents/Info.plist')]);};
(async()=>{
 await fs.mkdir(root,{recursive:true});const proof=path.join(root,'events.jsonl');await fs.writeFile(proof,'');
 const {ProjectStore}=await import('../engine/project-store.mjs'),sharp=(await import('sharp')).default;
 const projectRoot=path.join(root,'projects'),store=new ProjectStore(projectRoot),fixture=await sharp({create:{width:80,height:60,channels:4,background:'#2c91e8'}}).png().toBuffer();
 const image=await store.import(fixture,'原始照片.png');delete image.preview;
 // A complete current 0.4.8 schema, including the explicit canvas-sizing flag.
 // Omitting heightLocked intentionally invokes the older canvas-schema migration.
 const project={id:'migration-preserved',name:'旧版自定义名称',images:[image],initialOrder:[image.id],canvasMode:'fixed',heightLocked:true,canvasSizing:'manual',thumbnail:'data:image/png;base64,'+fixture.toString('base64'),canvas:{width:64,height:48},positions:{[image.id]:{x:2,y:3,width:40,height:30}},layout:'horizontal',export:{format:'png',targetBytes:30000000}};
 await store.save(project);const before=await store.load(project.id);
 const feed=path.join(root,'feed');await fs.mkdir(feed,{recursive:true});
 const hits=[];const server=http.createServer((req,res)=>{hits.push(req.url);const name=path.basename(new URL(req.url,'http://fixture').pathname);const stream=createReadStream(path.join(feed,name));stream.on('error',()=>{res.writeHead(404);res.end();});stream.pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const bundleID='com.qingtu.migration-fixture-'+Date.now();
 async function electronFixture(source,target,channel){
  await fs.rm(target,{recursive:true,force:true});await fs.cp(source,target,{recursive:true,verbatimSymlinks:true});
  const resources=path.join(target,'Contents/Resources'),file=path.join(resources,'app.asar'),expanded=path.join(root,'expanded-'+channel);await fs.rm(expanded,{recursive:true,force:true});asar.extractAll(file,expanded);
  const pkg=JSON.parse(await fs.readFile(path.join(expanded,'package.json'),'utf8'));pkg.main='migration-fixture.cjs';await fs.writeFile(path.join(expanded,'package.json'),JSON.stringify(pkg));
  const code=`const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');app.setActivationPolicy('accessory');app.setPath('userData',${JSON.stringify(path.join(root,'user-data-'+channel))});const proof=${JSON.stringify(proof)};const record=e=>fs.appendFileSync(proof,JSON.stringify({...e,pid:process.pid})+'\\n');(async()=>{await app.whenReady();const w=new BrowserWindow({show:false,x:32000,y:32000,opacity:0,webPreferences:{offscreen:true}});w.setPosition(32000,32000);w.setOpacity(0);w.hide();record({type:'launch',version:app.getVersion(),visible:w.isVisible(),offscreen:w.webContents.isOffscreen()});const {MacUpdater}=require('./desktop/mac-updater.cjs');const native=require('./desktop/sparkle-native.cjs');const updater=new MacUpdater({version:app.getVersion(),arch:process.arch,${channel==='mac'?'':"channel:'mac-light',systemVersion:process.getSystemVersion(),"}publicKey:require('./desktop/sparkle-public-key.json').publicKey,cacheRoot:${JSON.stringify(path.join(root,'cache-'+channel))},native:{install:o=>native.install({...o,onEvent:e=>{record(e);o.onEvent(e);}})}});updater.setFeedURL({url:${JSON.stringify(base)}});await updater.checkForUpdates();record({type:'available',from:app.getVersion(),to:updater.manifest?.version});await updater.downloadUpdate();record({type:'downloaded',from:app.getVersion()});await updater.quitAndInstall();})().catch(e=>{record({type:'failure',message:e.stack});app.exit(1)});`;
  await fs.writeFile(path.join(expanded,'migration-fixture.cjs'),code);await fs.rm(file);await asar.createPackage(expanded,file);
  plist(target,'CFBundleIdentifier','string',bundleID);plist(target,'LSUIElement','bool','true');
  run('codesign',['--force','--sign','-','--timestamp=none',target]);run('codesign',['--verify','--deep','--strict',target]);
 }
 try{
  const old=path.join(root,'installed/轻图.app'),bridge=path.join(root,'bridge/轻图.app'),light=path.join(root,'light/轻图.app');
  await electronFixture(path.resolve('release/mac-arm64/轻图.app'),old,'mac');await electronFixture(path.resolve('release/bridge-0.4.9/arm64/mac-arm64/轻图.app'),bridge,'mac-light');
  await fs.rm(light,{recursive:true,force:true});await fs.cp('.cache/lite-build/darwin-arm64/轻图.app',light,{recursive:true,verbatimSymlinks:true});plist(light,'CFBundleIdentifier','string',bundleID);plist(light,'LSUIElement','bool','true');
  const resources=path.join(light,'Contents/Resources'),bundle=path.join(resources,'resources.neu'),expanded=path.join(root,'light-resources');await fs.rm(expanded,{recursive:true,force:true});asar.extractAll(bundle,expanded);const config=JSON.parse(await fs.readFile(path.join(expanded,'neutralino.config.json'),'utf8'));config.applicationId=bundleID;Object.assign(config.modes.window,{hidden:true,center:false,x:32000,y:32000});await fs.writeFile(path.join(expanded,'neutralino.config.json'),JSON.stringify(config));await fs.rm(bundle);await asar.createPackage(expanded,bundle);await fs.writeFile(path.join(resources,'fixture.png'),fixture);
  // Test launcher adds only hidden/test-root/smoke arguments; the real native
  // runtime, helper, WebView UI and image engine execute after Sparkle relaunch.
  const launcher=await fs.readFile('desktop/lite/launcher/main.c','utf8'),flags=['--window-hidden=true','--window-center=false','--window-x=32000','--window-y=32000','--window-skip-taskbar=true','--qingtu-smoke','--qingtu-test-root='+projectRoot];
  const patched=launcher.replace('char **args=calloc(argc+2,sizeof(char*));','char **args=calloc(argc+16,sizeof(char*));').replace('for(int i=1;i<argc;i++)args[i+1]=argv[i];',flags.map((f,i)=>`args[${i+2}]=${JSON.stringify(f)};`).join(''));
  await fs.writeFile(path.join(root,'test-launcher.c'),patched);run('clang',['-arch','arm64','-mmacosx-version-min=13.3','-Os',path.join(root,'test-launcher.c'),'-o',path.join(light,'Contents/MacOS/轻图')]);run('codesign',['--force','--sign','-','--timestamp=none',light]);run('codesign',['--verify','--deep','--strict',light]);
  const crypto=require('node:crypto'),seed=Buffer.from((await fs.readFile('.cache/sparkle-signing/update-seed.txt','utf8')).trim(),'base64'),key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
  for(const [app,channel,v,min]of [[bridge,'mac','0.4.9','13.0'],[light,'mac-light',version,'13.3']]){const zip=path.join(root,`Fixture-${v}.zip`);run('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip]);await writeMacChannel({out:feed,file:zip,version:v,arch:'arm64',channel,minimumSystemVersion:min,key});}
  const log=await fs.open(path.join(root,'native.log'),'w'),child=spawn(path.join(old,'Contents/MacOS/轻图'),[],{stdio:['ignore',log.fd,log.fd],env:{...process.env,ELECTRON_ENABLE_LOGGING:'1'}});await log.close();console.log('Started hidden legacy fixture PID '+child.pid);
  const resultFile=path.join(old,'Contents/Resources/smoke-report.json');let result;
  for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,500));try{result=JSON.parse(await fs.readFile(resultFile,'utf8'));break;}catch{}const text=await fs.readFile(proof,'utf8');if(text.includes('"type":"failure"'))throw new Error(text);}
  assert.ok(result?.ok,JSON.stringify(result||{error:'timed out; inspect native.log'}));assert.equal(result.hidden,true);assert.deepEqual(result.position,{x:32000,y:32000});
  const events=(await fs.readFile(proof,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(events.filter(e=>e.type==='launch').map(e=>e.version),['0.4.8','0.4.9']);assert.ok(events.filter(e=>e.type==='launch').every(e=>e.visible===false&&e.offscreen===true));
  const diskVersion=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(old,'Contents/Info.plist')]).toString().trim();assert.equal(diskVersion,version);
  const after=await store.load(project.id);assert.deepEqual(after,before);assert.deepEqual(await fs.readFile(store.assetFile(image.assetId)),fixture);
  const report={passed:true,from:'0.4.8',bridge:'0.4.9',to:version,nativeSparkleReplaceAndRelaunch:true,hiddenOffscreen:true,legacyProjectUnchanged:true,sourceBytesUnchanged:true,events,lightweightSmoke:result,httpRequests:hits};await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,from:'0.4.8',bridge:'0.4.9',to:version,hiddenOffscreen:true,projectAndSourcePreserved:true}));
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
