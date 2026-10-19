import test from 'node:test';
import assert from 'node:assert/strict';
import {newer,decodeManifest} from '../src/lite/updater.mjs';
test('lightweight update versions compare numerically and never downgrade',()=>{assert.equal(newer('0.5.10','0.5.9'),true);assert.equal(newer('0.4.99','0.5.0'),false);assert.equal(newer('0.5.0','0.5.0'),false);});
test('lightweight update refuses unsigned or modified descriptions',()=>{assert.throws(()=>decodeManifest({payload:Buffer.from('{"version":"99.0.0"}').toString('base64'),signature:Buffer.alloc(64).toString('base64')},'darwin','arm64'),/签名/);assert.throws(()=>decodeManifest({},'win32','x64'),/描述/);});
import fs from 'node:fs/promises';
import {initializeUpdater,completeUpdateStartup} from '../src/lite/updater.mjs';
const signed=JSON.parse(await fs.readFile(new URL('./fixtures/lite-signed-manifest.json',import.meta.url),'utf8'));
test('official lightweight release signature binds platform, architecture and actual file',()=>{
 const m=decodeManifest(signed,'darwin','arm64');assert.equal(m.version,'0.5.0');assert.match(m.file.sha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>decodeManifest(signed,'darwin','x64'),/平台/);
 const modified={...signed,payload:Buffer.from(Buffer.from(signed.payload,'base64').toString().replace('0.5.0','9.9.9')).toString('base64')};assert.throws(()=>decodeManifest(modified,'darwin','arm64'),/签名/);
});
function context(native,flush=async()=>{}){
 const names=['process','save','stitchRender','stitchSave','stitchImport','stitchChooseFiles','chooseFiles','importFiles'];
 return {api:{platform:'darwin',...Object.fromEntries(names.map(n=>[n,async()=>true]))},native,info:{arch:'arm64'},flush,N:{os:{getPath:async()=>'/tmp',open:async()=>{}}},setState:()=>{},close:async()=>{}};
}
test('signed stable background check announces a newer version and a known update avoids repeated requests',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let calls=0;
 const ctx=context(async(method,url)=>{assert.equal(method,'fetchText');calls++;return url.includes('/api/')?JSON.stringify([{tag_name:'v0.4.8'},{tag_name:'v0.5.0'}]):JSON.stringify(signed);});
 initializeUpdater(ctx,'0.4.8');const found=await ctx.api.checkUpdate(false);assert.equal(found.phase,'available');assert.equal(found.availableVersion,'0.5.0');assert.equal(found.visible,true);
 await ctx.api.checkUpdate();assert.equal(calls,1);
});
test('rate limit stays quiet at startup and manual retries back off without another request',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let calls=0;const ctx=context(async()=>{calls++;throw new Error('HTTP 429');});initializeUpdater(ctx);
 const quiet=await ctx.api.checkUpdate(false);assert.equal(quiet.phase,'error');assert.equal(quiet.visible,false);assert.match(quiet.message,/Gitee/);
 const retry=await ctx.api.checkUpdate();assert.equal(retry.visible,true);assert.equal(calls,2);
});
test('install locks imports before flushing and restores the ready state after opening the verified Mac installer',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const ctx=context(async(method,url)=>method==='download'?'/tmp/verified.dmg':url.includes('/api/')?JSON.stringify([{tag_name:'v0.5.0'}]):JSON.stringify(signed),async()=>{entered();await gate;});initializeUpdater(ctx,'0.4.8');await ctx.api.checkUpdate();await ctx.api.downloadUpdate();
 const install=ctx.api.installUpdate();await waiting;await assert.rejects(ctx.api.importFiles([]),/安装/);assert.equal(await ctx.api.stitchSave({}),true,'pending manifest saves can finish');release();assert.equal((await install).phase,'ready');
});
test('signed stable channel checks and downloads normally when all Gitee API requests return 403',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];const requests=[];
 const ctx=context(async(method,url,...args)=>{requests.push({method,url,args});if(url.includes('/api/'))throw Error('HTTP 403');if(method==='download')return '/tmp/verified.dmg';assert.equal(url,'https://gitee.com/a1meon_admin/halframe-releases/raw/main/updates/stable/lite-darwin-arm64.json');return JSON.stringify(signed);});
 initializeUpdater(ctx,'0.4.8');assert.equal((await ctx.api.checkUpdate(false)).phase,'available');assert.equal((await ctx.api.downloadUpdate()).phase,'ready');
 assert.equal(requests[1].url,'https://gitee.com/a1meon_admin/halframe-releases/releases/download/v0.5.0/Qingtu-0.5.0-Mac-arm64-Installer.dmg');
 assert.equal(requests[1].args[1],decodeManifest(signed,'darwin','arm64').file.sha256);
});
test('public formal release page remains an API-free backup when stable raw hosting is unavailable',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];
 const ctx=context(async(method,url)=>{if(url.includes('/raw/'))throw Error('HTTP 503');if(url.endsWith('/releases/latest'))return `<div class='release-header-main'><a class="title" href="/a1meon_admin/halframe-releases/releases/tag/v0.5.0">Release</a><div class='ui label latest-version'>latest</div></div>`;if(url.endsWith('/v0.5.0/lite-auto-darwin-arm64.json'))return JSON.stringify(signed);throw Error('unexpected '+url);});
 initializeUpdater(ctx,'0.4.8');const state=await ctx.api.checkUpdate();assert.equal(state.phase,'available');assert.equal(state.availableVersion,'0.5.0');
});
test('invalid stable metadata cannot be replaced by an unverified fallback',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let requests=0;const ctx=context(async()=>{requests++;return JSON.stringify({...signed,signature:Buffer.alloc(64).toString('base64')});});
 initializeUpdater(ctx,'0.4.8');assert.equal((await ctx.api.checkUpdate()).phase,'error');assert.equal(requests,1);
});
test('Mac signed ZIP updates prepare atomic replacement after flushing and close without opening an installer',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];const steps=[];
 const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/lite-signed-mac-zip.json',import.meta.url),'utf8'));
 const ctx=context(async(method,url)=>{if(method==='fetchText')return JSON.stringify(fixture);if(method==='download')return '/tmp/verified.zip';if(method==='installMacUpdate'){steps.push('prepare');return '/tmp/plan.json';}throw Error(method);},async()=>steps.push('flush'));
 ctx.close=async()=>steps.push('close');ctx.N.os.open=async()=>{throw Error('Mac ZIP update must install in app');};
 initializeUpdater(ctx,'0.4.8');assert.equal((await ctx.api.checkUpdate()).phase,'available');const ready=await ctx.api.downloadUpdate();assert.equal(ready.manualInstall,false);assert.equal(ready.installLabel,'安装并重启');await ctx.api.installUpdate();assert.deepEqual(steps,['flush','prepare','close']);
});

test('optional interrupted-update discovery cannot prevent an ordinary Mac launch',async()=>{globalThis.NL_ARGS=['--qingtu-smoke'];const ctx=context(async()=>{throw Error('application folder listing denied');});await assert.doesNotReject(completeUpdateStartup(ctx));});
