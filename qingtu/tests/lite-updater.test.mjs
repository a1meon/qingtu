import test from 'node:test';
import assert from 'node:assert/strict';
import {newer,decodeManifest} from '../src/lite/updater.mjs';
test('lightweight update versions compare numerically and never downgrade',()=>{assert.equal(newer('0.5.10','0.5.9'),true);assert.equal(newer('0.4.99','0.5.0'),false);assert.equal(newer('0.5.0','0.5.0'),false);});
test('lightweight update refuses unsigned or modified descriptions',()=>{assert.throws(()=>decodeManifest({payload:Buffer.from('{"version":"99.0.0"}').toString('base64'),signature:Buffer.alloc(64).toString('base64')},'darwin','arm64'),/签名/);assert.throws(()=>decodeManifest({},'win32','x64'),/描述/);});
import fs from 'node:fs/promises';
import {initializeUpdater} from '../src/lite/updater.mjs';
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
test('background check orders Gitee versions numerically and a known update avoids repeated API requests',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let calls=0;
 const ctx=context(async(method,url)=>{assert.equal(method,'fetchText');calls++;return url.includes('/api/')?JSON.stringify([{tag_name:'v0.4.8'},{tag_name:'v0.5.0'}]):JSON.stringify(signed);});
 initializeUpdater(ctx,'0.4.8');const found=await ctx.api.checkUpdate(false);assert.equal(found.phase,'available');assert.equal(found.availableVersion,'0.5.0');assert.equal(found.visible,true);
 await ctx.api.checkUpdate();assert.equal(calls,2);
});
test('rate limit stays quiet at startup and manual retries back off without another request',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let calls=0;const ctx=context(async()=>{calls++;throw new Error('HTTP 429');});initializeUpdater(ctx);
 const quiet=await ctx.api.checkUpdate(false);assert.equal(quiet.phase,'error');assert.equal(quiet.visible,false);assert.match(quiet.message,/Gitee/);
 const retry=await ctx.api.checkUpdate();assert.equal(retry.visible,true);assert.equal(calls,1);
});
test('install locks imports before flushing and restores the ready state after opening the verified Mac installer',async()=>{
 globalThis.NL_ARGS=['--qingtu-smoke'];let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const ctx=context(async(method,url)=>method==='download'?'/tmp/verified.dmg':url.includes('/api/')?JSON.stringify([{tag_name:'v0.5.0'}]):JSON.stringify(signed),async()=>{entered();await gate;});initializeUpdater(ctx,'0.4.8');await ctx.api.checkUpdate();await ctx.api.downloadUpdate();
 const install=ctx.api.installUpdate();await waiting;await assert.rejects(ctx.api.importFiles([]),/安装/);assert.equal(await ctx.api.stitchSave({}),true,'pending manifest saves can finish');release();assert.equal((await install).phase,'ready');
});
