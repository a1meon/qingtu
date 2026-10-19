const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveUpdateFeed}=require('../desktop/update-source.cjs');
const signed=require('./fixtures/lite-signed-manifest.json');
test('Gitee stable signed release resolves a generic feed using its exact immutable tag',async()=>{
 let requested;
 const feed=await resolveUpdateFeed({provider:'gitee',owner:'qingtu-test',repo:'desktop'},'darwin','arm64',async url=>{requested=url;return signed;});
 assert.equal(requested,'https://gitee.com/qingtu-test/desktop/raw/main/updates/stable/lite-darwin-arm64.json');
 assert.equal(feed.url,'https://gitee.com/qingtu-test/desktop/releases/download/v0.5.0/');assert.equal(feed.provider,'generic');
 const {GenericProvider}=require('electron-updater/out/providers/GenericProvider');
 assert.equal(new GenericProvider(feed,{}, {platform:'darwin',executor:{}}).channel,'latest-arm64-mac');
});
test('generic source separates Mac architectures and Windows feeds',async()=>{
 const config={provider:'generic',url:'https://downloads.example.test/qingtu/'};
 assert.equal((await resolveUpdateFeed(config,'darwin','arm64')).url,'https://downloads.example.test/qingtu/mac-arm64/');
 assert.equal((await resolveUpdateFeed(config,'darwin','x64')).url,'https://downloads.example.test/qingtu/mac-x64/');
 assert.equal((await resolveUpdateFeed(config,'win32','x64')).url,'https://downloads.example.test/qingtu/win-x64/');
});
test('empty source disables updates and malformed or insecure sources fail before network access',async()=>{
 assert.equal(await resolveUpdateFeed({provider:'gitee',owner:'',repo:''},'darwin','arm64'),null);
 for(const url of ['http://downloads.example.test/','https://user:secret@example.test/','file:///tmp/update'])await assert.rejects(resolveUpdateFeed({provider:'generic',url},'win32','x64'),/HTTPS/);
 await assert.rejects(resolveUpdateFeed({provider:'gitee',owner:'../bad',repo:'app'},'darwin','arm64'),/仓库/);
});
test('Gitee API rate limits do not block discovery from its public formal release page',async()=>{
 const feed=await resolveUpdateFeed({provider:'gitee',owner:'qingtu-test',repo:'desktop'},'darwin','arm64',async()=>{throw Error('HTTP 403');},async url=>{
  assert.equal(url,'https://gitee.com/qingtu-test/desktop/releases/latest');
  return `<div class='release-header-main'><a class='title' href='/qingtu-test/desktop/releases/tag/v0.5.4'>Release</a><div class='latest-version'>latest</div></div>`;
 });assert.equal(feed.url,'https://gitee.com/qingtu-test/desktop/releases/download/v0.5.4/');
});
