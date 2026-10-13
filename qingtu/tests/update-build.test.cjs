const {test}=require('node:test');const assert=require('node:assert/strict');
const {updateBuild}=require('../scripts/prepare-update-build.cjs');
test('Gitee builds emit a version-specific feed and keep native updater targets',()=>{
 const pkg={version:'0.4.2',build:{mac:{target:['dmg','zip'],identity:null},win:{target:['nsis']}}};
 const built=updateBuild({provider:'gitee',owner:'test-owner',repo:'qingtu'},pkg,'darwin','arm64');
 assert.equal(built.config.publish[0].url,'https://gitee.com/test-owner/qingtu/releases/download/v0.4.2/');
 assert.deepEqual(built.config.mac.target,['dmg','zip']);assert.equal(Object.hasOwn(built.config.mac,'identity'),false);
 assert.equal(pkg.build.mac.identity,null,'source config is not mutated');
});
test('unconfigured builds embed a disabled source without inventing a download URL',()=>{
 const built=updateBuild({provider:'gitee',owner:'',repo:''},{version:'0.4.2',build:{}},'win32','x64');assert.equal(built.config.publish,null);
 assert.equal(built.config.extraResources[0].to,'qingtu-update-source.json');
});
test('domestic HTTPS build feed matches the runtime platform directory',()=>{
 const built=updateBuild({provider:'generic',url:'https://cdn.example.test/qingtu'},{version:'0.4.2',build:{}},'darwin','x64');
 assert.equal(built.url,'https://cdn.example.test/qingtu/mac-x64/');
 assert.throws(()=>updateBuild({provider:'generic',url:'http://example.test'},{version:'0.4.2',build:{}},'darwin','x64'),/HTTPS/);
});
test('platform builds exclude foreign Sharp binaries and retain their own native runtime',()=>{
 const pkg={version:'0.4.2',build:{files:['desktop/**/*','engine/**/*']}};
 const source={provider:'gitee',owner:'test-owner',repo:'qingtu'};
 const win=updateBuild(source,pkg,'win32','x64').config;
 assert.ok(win.files.includes('!node_modules/@img/sharp-libvips-darwin-arm64/**/*'));
 assert.ok(win.files.includes('!node_modules/@img/sharp-libvips-darwin-x64/**/*'));
 assert.ok(!win.files.includes('!node_modules/@img/sharp-win32-x64/**/*'));
 const mac=updateBuild(source,pkg,'darwin','arm64').config;
 assert.ok(mac.files.includes('!node_modules/@img/sharp-win32-x64/**/*'));
 assert.ok(mac.files.includes('!node_modules/@img/sharp-darwin-x64/**/*'));
 assert.ok(!mac.files.includes('!node_modules/@img/sharp-darwin-arm64/**/*'));
 assert.deepEqual(pkg.build.files,['desktop/**/*','engine/**/*'],'packaging does not mutate source config');
});
test('Mac Sparkle builds carry only public trust material, local networking and native assets',()=>{
 const pub=Buffer.alloc(32,2).toString('base64');const config=updateBuild({provider:'gitee',owner:'test-owner',repo:'qingtu'},{version:'0.4.4',build:{files:[],mac:{identity:null}}},'darwin','arm64',pub).config;
 assert.equal(config.mac.identity,'-');assert.equal(config.mac.extendInfo.SUPublicEDKey,pub);assert.equal(config.mac.extendInfo.NSAppTransportSecurity.NSAllowsLocalNetworking,true);assert.equal(config.mac.extendInfo.SUVerifyUpdateBeforeExtraction,true);assert.equal(config.mac.extendInfo.SUEnableAutomaticChecks,false);assert.equal(config.afterPack,'./scripts/stage-sparkle.cjs');assert.ok(config.extraResources.some(r=>r.to==='qingtu-sparkle-arm64.node'));
});
