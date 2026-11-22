const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {UpdateController}=require('../desktop/update-controller.cjs');
// Native download/install is an external boundary: never quit or install in tests.
class NativeAdapter extends EventEmitter {
 checks=0;downloads=0;installs=0;
 async checkForUpdates(){this.checks++;this.emit('update-available',{version:'0.5.0'});return {};}
 async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:42});this.emit('update-downloaded',{version:'0.5.0'});return [];}
 quitAndInstall(){this.installs++;}
 setFeedURL(feed){this.feed=feed;}
}
const make=(options={})=>{const adapter=new NativeAdapter();return {adapter,controller:new UpdateController({version:'0.4.2',updater:adapter,resolveFeed:async()=>({provider:'generic',url:'https://downloads.example.test/win-x64/'}),...options})};};
test('checking or declining a new version never downloads; confirmed download stages it',async()=>{
 const {controller,adapter}=make();await controller.check(false);
 assert.equal(controller.status().phase,'available');assert.equal(adapter.downloads,0);assert.equal(adapter.autoDownload,false);assert.equal(adapter.autoInstallOnAppQuit,false);
 await controller.download();assert.equal(adapter.downloads,1);assert.equal(controller.status().phase,'ready');assert.equal(adapter.installs,0);
 controller.install();assert.equal(adapter.installs,1);
});
test('offline launch remains silent; clicking the version reports failure and can retry',async()=>{
 const {controller,adapter}=make();adapter.checkForUpdates=async()=>{throw Object.assign(new Error('offline'),{code:'ENOTFOUND'});};
 await controller.check(false);assert.equal(controller.status().phase,'offline');assert.equal(controller.status().visible,false);
 await controller.check(true);assert.equal(controller.status().phase,'offline');assert.equal(controller.status().visible,true);
 adapter.checkForUpdates=async()=>adapter.emit('update-not-available',{});
 await controller.check(true);assert.equal(controller.status().phase,'current');
});
test('duplicate checks share one request and manual check makes current result visible',async()=>{
 const {controller,adapter}=make();let release;
 adapter.checkForUpdates=()=>{adapter.checks++;return new Promise(r=>release=()=>{adapter.emit('update-not-available',{});r({});});};
 const first=controller.check(false);await new Promise(r=>setImmediate(r));const second=controller.check(true);release();await Promise.all([first,second]);
 assert.equal(adapter.checks,1);assert.equal(controller.status().visible,true);assert.equal(controller.status().phase,'current');
});
test('download and install are guarded; active processing prevents restart',async()=>{
 const {controller,adapter}=make({canInstall:()=>false});
 await assert.rejects(controller.download(),/新版本/);assert.throws(()=>controller.install(),/下载/);
 await controller.check(true);await controller.download();assert.throws(()=>controller.install(),/处理/);assert.equal(adapter.installs,0);
});
test('download interruption preserves available version for retry',async()=>{
 const {controller,adapter}=make();await controller.check(true);
 adapter.downloadUpdate=async()=>{throw Object.assign(new Error('reset'),{code:'ECONNRESET'});};
 await controller.download();assert.equal(controller.status().phase,'error');assert.equal(controller.status().availableVersion,'0.5.0');assert.equal(adapter.installs,0);
 adapter.downloadUpdate=NativeAdapter.prototype.downloadUpdate;await controller.download();assert.equal(controller.status().phase,'ready');
});
test('unconfigured and preview installations never call a remote updater',async()=>{
 const {controller,adapter}=make({resolveFeed:async()=>null});await controller.check(false);assert.equal(controller.status().visible,false);
 await controller.check(true);assert.equal(controller.status().phase,'unconfigured');assert.equal(adapter.checks,0);
});
test('ready update is retained when checking again and concurrent downloads do not duplicate',async()=>{
 const {controller,adapter}=make();await controller.check(true);await Promise.all([controller.download(),controller.download()]);
 await controller.check(true);assert.equal(controller.status().phase,'ready');assert.equal(adapter.downloads,1);assert.equal(adapter.checks,1);
});
test('asynchronous native startup enters installation state and failures are handled for retry',async()=>{
 const {controller,adapter}=make();await controller.check(true);await controller.download();let reject;adapter.quitAndInstall=()=>new Promise((_,r)=>reject=r);
 const installing=controller.install();assert.equal(controller.status().phase,'installing');assert.throws(()=>controller.install(),/下载/);reject(new Error('native failed'));await assert.rejects(installing,/native failed/);assert.equal(controller.status().phase,'error');assert.match(controller.status().message,/安装/);
});

test('development preview identifies itself on manual check without calling the release service',async()=>{
 const {controller,adapter}=make({development:true,resolveFeed:()=>assert.fail('preview fetched remote release')});
 assert.equal((await controller.check(false)).visible,false);
 const result=await controller.check(true);
 assert.equal(result.phase,'development');assert.equal(result.visible,true);assert.equal(adapter.checks,0);
});
