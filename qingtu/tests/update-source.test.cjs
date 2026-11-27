const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveUpdateFeed}=require('../desktop/update-source.cjs');
test('Gitee latest release resolves a generic feed using its exact immutable tag',async()=>{
 let requested;
 const feed=await resolveUpdateFeed({provider:'gitee',owner:'qingtu-test',repo:'desktop'},'darwin','arm64',async url=>{requested=url;return {tag_name:'v0.5.0',prerelease:false};});
 assert.equal(requested,'https://gitee.com/api/v5/repos/qingtu-test/desktop/releases/latest');
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

test('unavailable, invalid or prerelease primary discovers the stable GitHub tag and pins both download hosts',async()=>{
 const config={provider:'cnb',owner:'sample',repo:'qingtu',mirrors:[{provider:'github',owner:'a1meon',repo:'qingtu'}]};
 for(const primary of [null,{tag_name:'v1.0.0',draft:true},{tag_name:'v9.0.0',prerelease:true},{tag_name:'../other'}]){
  const requests=[];
  const feed=await resolveUpdateFeed(config,'win32','x64',async url=>{
   requests.push(url);
   if(url.includes('cnb.cool')){if(!primary)throw Error('unavailable');return primary;}
   return {tag_name:'v1.2.3'};
  });
  assert.deepEqual(requests,['https://cnb.cool/sample/qingtu/-/git/raw/qingtu-updates/stable.json','https://api.github.com/repos/a1meon/qingtu/releases/latest']);
  assert.equal(feed.releaseVersion,'1.2.3');
  assert.equal(feed.url,'https://github.com/a1meon/qingtu/releases/download/v1.2.3/');
  assert.deepEqual(feed.mirrorUrls,['https://cnb.cool/sample/qingtu/-/releases/download/v1.2.3/']);
 }
 const feed=await resolveUpdateFeed(config,'darwin','x64',async url=>{assert.match(url,/cnb.cool/);return {tag_name:'v1.2.4'};});
 assert.match(feed.url,/cnb.cool/);assert.match(feed.mirrorUrls[0],/github.*v1.2.4\/$/);
});
