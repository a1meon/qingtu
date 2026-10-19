// Read/download-only release smoke. Never launches an installer or a window.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {initializeUpdater} from '../src/lite/updater.mjs';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
globalThis.NL_ARGS=['--qingtu-smoke'];
const helper=spawn(path.resolve('.cache/lite-build/darwin-arm64/轻图.app/Contents/MacOS/qingtu-io'),[],{stdio:['pipe','pipe','pipe']});
let next=0,buffer='';const waiting=new Map();
helper.stdout.setEncoding('utf8');helper.stdout.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line)continue;const m=JSON.parse(line),p=waiting.get(m.id);waiting.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
helper.on('exit',()=>{for(const p of waiting.values())p.reject(new Error('Native helper exited'));});
const request=(method,...args)=>new Promise((resolve,reject)=>{const id=++next;waiting.set(id,{resolve,reject});helper.stdin.write(JSON.stringify({id,method,args})+'\n');});
let releases,networkCalls=0,downloaded=0;
const native=async(method,...args)=>{if(method==='fetchText'&&args[0].includes('/api/')){if(!releases){networkCalls++;releases=await request(method,...args);}return releases;}if(method==='download')downloaded++;return request(method,...args);};
function context(){return {api:{platform:'darwin',...Object.fromEntries(['process','save','stitchRender','stitchSave','stitchImport','stitchChooseFiles','chooseFiles','importFiles'].map(name=>[name,async()=>true]))},native,N:{os:{getPath:async()=>path.resolve('.cache/live-lite-update'),open:async()=>{throw new Error('Installation forbidden in read-only smoke');}}},info:{arch:'arm64'},flush:async()=>{},setState:()=>{},close:async()=>{throw new Error('Closing forbidden in read-only smoke');}};}
try{
 const current=context();initializeUpdater(current);const same=await current.api.checkUpdate();assert.equal(same.phase,'current');assert.equal(downloaded,0,'current version never downloads');
 const old=context();initializeUpdater(old,'0.4.8');const available=await old.api.checkUpdate();assert.equal(available.phase,'available');assert.equal(available.availableVersion,version);
 const ready=await old.api.downloadUpdate();assert.equal(ready.phase,'ready');assert.equal(ready.manualInstall,true);assert.equal(downloaded,1);
 const report={version,nativeHTTPS:true,currentVersionPhase:same.phase,currentVersionAutomaticDownloads:0,newerVersionPhase:available.phase,signedDownloadPhase:ready.phase,manualMacInstall:ready.manualInstall,apiRequests:networkCalls,installerExecuted:false};await fs.writeFile('artifacts/gitee-v'+version.replaceAll('.','')+'-live-update.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{helper.stdin.end();}
