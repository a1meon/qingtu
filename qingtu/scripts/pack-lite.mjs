import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {windowOptions} from '../src/lite/window-shell.mjs';
import {applyWindowManifest} from './windows-window-manifest.mjs';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const root=process.cwd(),pkg=JSON.parse(await fs.readFile('package.json','utf8')),version=pkg.version;
const out=path.resolve('release/lite-'+version),work=path.resolve('.cache/lite-build');
const hash=b=>createHash('sha256').update(b).digest('hex');
function run(command,args,options={}){const r=spawnSync(command,args,{stdio:'inherit',...options});if(r.status!==0)throw new Error(command+' failed: '+r.status);}
await fs.mkdir(out,{recursive:true});await fs.mkdir(work,{recursive:true});
const neutralino='.cache/lite-probe/neutralino',go=path.resolve('.cache/lite-go/go/bin/go');
const checks=[['.cache/lite-probe/neutralino.zip','e633f480737f229f582d8ec6165a52d789340950aef062560702122389f08329'],['.cache/lite-go/go.tar.gz','76812b213b1b2302c978d28fa52fa92d541704b9e7d9d5db8002c50e4018c4c5'],['.cache/lite-probe/MicrosoftEdgeWebview2Setup.exe','90ae8eb0d9d22d6e51fccde49e4d25d266ff9343ad0cc931faa6f482569cea62']];
for(const [p,expected]of checks)if(hash(await fs.readFile(p))!==expected)throw new Error('Dependency integrity check failed: '+p);
run(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.lite.config.mjs']);
const resourceRoot=path.join(work,'bundle');await fs.rm(resourceRoot,{recursive:true,force:true});
await fs.mkdir(path.join(resourceRoot,'resources'),{recursive:true});
await fs.cp('dist/lite',path.join(resourceRoot,'resources'),{recursive:true});
// Samples are development fixtures; production starts empty and never imports them.
await fs.rm(path.join(resourceRoot,'resources','samples'),{recursive:true,force:true});
const vipsDir=path.join(resourceRoot,'resources','vips');await fs.mkdir(vipsDir);
for(const name of ['vips-es6.js','vips.wasm','vips-heif.wasm','vips-jxl.wasm','vips-resvg.wasm'])await fs.copyFile('node_modules/wasm-vips/lib/'+name,path.join(vipsDir,name));
await fs.copyFile('node_modules/wasm-vips/THIRD-PARTY-NOTICES.md',path.join(vipsDir,'THIRD-PARTY-NOTICES.md'));
const licenseDir=path.join(resourceRoot,'resources','licenses');await fs.mkdir(licenseDir);await fs.copyFile('desktop/lite/THIRD-PARTY-NOTICES.txt',path.join(licenseDir,'THIRD-PARTY-NOTICES.txt'));
for(const name of ['@neutralinojs/lib','react','react-dom','buffer','path-browserify','@noble/hashes','@noble/curves','@phosphor-icons/react']){const directory=path.join('node_modules',name);const license=(await fs.readdir(directory)).find(n=>/^license(?:\.|$)/i.test(n));if(license)await fs.copyFile(path.join(directory,license),path.join(licenseDir,name.replaceAll('/','-')+'-LICENSE.txt'));}
await fs.copyFile('.cache/lite-go/go/LICENSE',path.join(licenseDir,'Go-LICENSE.txt'));
const config={applicationId:'com.qingtu.desktop',version,defaultMode:'window',port:0,documentRoot:'/resources/',url:'/',enableServer:true,enableNativeAPI:true,tokenSecurity:'one-time',dataLocation:'system',exportAuthInfo:false,logging:{enabled:false},nativeAllowList:['app.exit','os.spawnProcess','os.updateSpawnedProcess','os.showOpenDialog','os.showFolderDialog','os.showMessageBox','os.getPath','os.open','filesystem.writeFile','window.*','events.*'],serverHeaders:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'},modes:{window:{title:'轻图',width:1280,height:820,minWidth:600,minHeight:500,hidden:false,center:true,exitProcessOnClose:false,useSavedState:false,injectGlobals:false,injectClientLibrary:false,icon:'/resources/assets/app-icon.png'}}};
const artifacts=[];
for(const [platform,arch,goos,goarch]of [['darwin','arm64','darwin','arm64'],['darwin','x64','darwin','amd64'],['win32','x64','windows','amd64']]){
 const stage=path.join(work,platform+'-'+arch);await fs.rm(stage,{recursive:true,force:true});
 const app=platform==='darwin'?path.join(stage,'轻图.app'):stage;
 const bin=platform==='darwin'?path.join(app,'Contents','MacOS'):app;await fs.mkdir(bin,{recursive:true});
 const executable=path.join(bin,platform==='darwin'?'轻图':'轻图.exe');
 await fs.copyFile(path.join(neutralino,platform==='darwin'?'neutralino-mac_'+arch:'neutralino-win_x64.exe'),executable);await fs.chmod(executable,0o755);
 if(platform==='win32')await fs.writeFile(executable,applyWindowManifest(await fs.readFile(executable)));
 run(go,['-C','desktop/lite','build','-trimpath','-ldflags=-s -w'+(platform==='win32'?' -H=windowsgui':''),'-o',path.join(bin,'qingtu-io'+(platform==='win32'?'.exe':'')),'.'],{env:{...process.env,CGO_ENABLED:'0',GOOS:goos,GOARCH:goarch}});
 const platformConfig=structuredClone(config);platformConfig.modes.window=windowOptions(platform);
 if(platform==='darwin')platformConfig.globalVariables={IO_PATH:'../MacOS/qingtu-io'};
 await fs.writeFile(path.join(resourceRoot,'neutralino.config.json'),JSON.stringify(platformConfig));
 const resourceDestination=platform==='darwin'?path.join(app,'Contents','Resources'):bin;await fs.mkdir(resourceDestination,{recursive:true});
 await asar.createPackage(resourceRoot,path.join(resourceDestination,'resources.neu'));
 let name;
 if(platform==='darwin'){
  const resources=path.join(app,'Contents','Resources');await fs.mkdir(resources,{recursive:true});await fs.copyFile('build/icon.icns',path.join(resources,'icon.icns'));
  const publicKey=JSON.parse(await fs.readFile('desktop/sparkle-public-key.json','utf8')).publicKey;
  const plist={CFBundleDisplayName:'轻图',CFBundleName:'轻图',CFBundleIdentifier:'com.qingtu.desktop',CFBundleExecutable:'轻图',CFBundlePackageType:'APPL',CFBundleShortVersionString:version,CFBundleVersion:version,CFBundleIconFile:'icon.icns',LSMinimumSystemVersion:'13.3',NSHighResolutionCapable:true,NSPrincipalClass:'NSApplication',SUPublicEDKey:publicKey};
  await fs.writeFile(path.join(app,'Contents','Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'+Object.entries(plist).map(([k,v])=>`<key>${k}</key>`+(v===true?'<true/>':`<string>${v}</string>`)).join('')+'</dict></plist>');
  await fs.rename(executable,path.join(bin,'qingtu-runtime'));run('clang',['-arch',arch==='x64'?'x86_64':arch,'-mmacosx-version-min=13.3','-Os','desktop/lite/launcher/main.c','-o',executable]);
  run('codesign',['--force','--sign','-','--timestamp=none',path.join(bin,'qingtu-runtime')]);run('codesign',['--force','--sign','-','--timestamp=none',path.join(bin,'qingtu-io')]);run('codesign',['--force','--sign','-','--timestamp=none',app]);run('codesign',['--verify','--deep','--strict',app]);
  const zip=`Qingtu-${version}-Mac-${arch}.zip`;run('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,path.join(out,zip)]);artifacts.push({platform,arch,name:zip,kind:'zip'});
  const dmgSource=path.join(work,'dmg-'+arch);await fs.rm(dmgSource,{recursive:true,force:true});await fs.mkdir(dmgSource);await fs.cp(app,path.join(dmgSource,'轻图.app'),{recursive:true});await fs.symlink('/Applications',path.join(dmgSource,'应用程序'));
  name=`Qingtu-${version}-Mac-${arch}-Installer.dmg`;await fs.rm(path.join(out,name),{force:true});run('hdiutil',['create','-quiet','-volname','轻图 '+version,'-srcfolder',dmgSource,'-format','UDZO',path.join(out,name)]);
 }else{
  await fs.copyFile('build/icon.ico',path.join(bin,'icon.ico'));name=`Qingtu-${version}-Windows-x64-Setup.exe`;
  const nsis=path.join(os.homedir(),'Library/Caches/electron-builder/nsis@1.2.1/nsis-bundle-3.12-wfwns');
  run(path.join(nsis,'mac/arm64/makensis'),['-V2',`-DVERSION=${version}`,`-DOUTPUT=${path.join(out,name)}`,`-DAPPDIR=${stage}`,`-DICON=${path.resolve('build/icon.ico')}`,`-DWEBVIEW=${path.resolve('.cache/lite-probe/MicrosoftEdgeWebview2Setup.exe')}`,path.resolve('desktop/lite/installer.nsi')],{env:{...process.env,NSISDIR:path.join(nsis,'windows')}});
 }
 artifacts.push({platform,arch,name,kind:'installer'});
}
// Reuse the existing trusted signing identity without exposing the seed.
const seed=Buffer.from((await fs.readFile('.cache/sparkle-signing/update-seed.txt','utf8')).trim(),'base64');
const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64');
if(publicKey!==JSON.parse(await fs.readFile('desktop/sparkle-public-key.json','utf8')).publicKey)throw new Error('Signing identity mismatch');
for(const item of artifacts){const bytes=await fs.readFile(path.join(out,item.name));Object.assign(item,{size:bytes.length,sha256:hash(bytes)});if(item.kind==='installer'){
 const manifest={version,platform:item.platform,arch:item.arch,minOS:item.platform==='darwin'?'13.3':'Windows 10',file:{name:item.name,size:item.size,sha256:item.sha256}};const payload=Buffer.from(JSON.stringify(manifest));await fs.writeFile(path.join(out,`lite-${item.platform}-${item.arch}.json`),JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')},null,2)+'\n');
}}
await fs.writeFile(path.join(out,'SHA256SUMS-'+version+'.txt'),artifacts.map(a=>a.sha256+'  '+a.name).join('\n')+'\n');await fs.writeFile(path.join(out,'build-report.json'),JSON.stringify({version,artifacts,dependencies:checks.map(([file,sha256])=>({file,sha256}))},null,2)+'\n');
const publishedNames=[...artifacts.map(a=>a.name),'lite-darwin-arm64.json','lite-darwin-x64.json','lite-win32-x64.json'];await fs.writeFile(path.join(out,'SHA256SUMS-'+version+'.txt'),(await Promise.all(publishedNames.map(async name=>hash(await fs.readFile(path.join(out,name)))+'  '+name))).join('\n')+'\n');
// Every latest release also serves old clients. Never point the unguarded Mac
// legacy channel straight at a WebView build requiring a newer operating system.
await require('./prepare-legacy-update.cjs').prepare(version);
console.log(JSON.stringify(artifacts.map(({name,size})=>({name,MB:(size/1000000).toFixed(2)})),null,2));
