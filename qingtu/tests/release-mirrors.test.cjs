const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const yaml = require('js-yaml');
const {GiteeChunkProvider} = require('../desktop/chunk-provider.cjs');
const {checksums,requiredFiles,sameAssets} = require('../scripts/mirror-release.cjs');
const version = '1.2.3', primary = 'https://primary.test/v1.2.3/', backup = 'https://backup.test/v1.2.3/';
const sha512 = createHash('sha512').update('a').digest('base64');
function file(suffix) {
 const url = 'Qingtu-' + version + '-' + suffix;
 return {url, size:1, sha512};
}
test('Windows SDK retries the selected tag on the second host and hands all matching hosts to transport',async()=>{
 const installer = file('win-x64.exe'), requests = [], registered = [];
 const executor = {request: async options => {
  requests.push(options.hostname + options.path);
  return yaml.dump({version:options.hostname === 'primary.test' ? '1.2.2' : version,files:[installer]});
 }};
 const transport = {reset(){}, register(...args){registered.push(args);return new URL('http://127.0.0.1/installer.exe');}};
 const provider = new GiteeChunkProvider({url:primary, mirrorUrls:[backup], releaseVersion:version, transport, channel:'latest'}, {}, {platform:'win32',executor});
 const info = await provider.getLatestVersion();
 assert.equal(info.version,version);assert.deepEqual(requests,['primary.test/v1.2.3/latest.yml','backup.test/v1.2.3/latest.yml']);
 provider.resolveFiles(info);assert.equal(registered[0][1],backup);assert.deepEqual(registered[0][3],[primary]);
});
test('release verification requires both Mac installers, Windows and every complete archive and advertised patch',()=>{
 const win = file('win-x64.exe'),macs={};
 win.qingtuDelta={url:win.url+'.from-1.2.2.qtdelta'};
 for(const arch of ['arm64','x64'])macs[arch]={arch,version,file:file('mac-'+arch+'.zip')};
 const required=requiredFiles(version,{version,files:[win]},macs,primary);
 assert.equal(required.size,10);
 for(const name of required){
  const incomplete=new Set(required);incomplete.delete(name);assert.throws(()=>sameAssets(required,incomplete),/不完整/);
 }
 assert.ok(required.has(win.qingtuDelta.url));
 assert.throws(()=>requiredFiles(version,{version:'1.2.2',files:[win]},macs,primary));
 const line='a'.repeat(64)+'  latest.yml';
 assert.equal(checksums(line+'\n').get('latest.yml'),'a'.repeat(64));
 assert.throws(()=>checksums(line+'\n'+line));assert.throws(()=>checksums(line.replace('latest.yml','../latest.yml')));
});

test('mirror checks the reconstructed package and advertised patch before uploading',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-manifest-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const target=file('win-x64.exe');target.qingtuDelta={url:'change.qtdelta',size:1,sha512};
 const {verifyPayload}=require('../scripts/mirror-release.cjs');
 await fs.writeFile(path.join(dir,target.url),'a');
 await fs.writeFile(path.join(dir,'change.qtdelta'),'a');
 await verifyPayload(dir,target);
 await fs.writeFile(path.join(dir,'change.qtdelta'),'b');
 await assert.rejects(verifyPayload(dir,target),/change.qtdelta/);
 await assert.rejects(verifyPayload(dir,{...target,sha512:'wrong'}),/完整包/);
});

test('Windows binds the complete EXE and delta to the signed version and rejects arbitrary package overrides',()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {signedBytes,verifyWindowsManifest}=require('../desktop/windows-manifest.cjs');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const raw=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const info={version,files:[file('win-x64.exe')]};
 info.qingtuSignature=sign(null,signedBytes(info),privateKey).toString('base64');
 assert.doesNotThrow(()=>verifyWindowsManifest(info,raw));
 assert.throws(()=>verifyWindowsManifest({...info,packages:{x64:{path:'another.7z'}}},raw));
 info.files[0].qingtuDelta={url:'other.qtdelta'};
 assert.throws(()=>verifyWindowsManifest(info,raw));
});
