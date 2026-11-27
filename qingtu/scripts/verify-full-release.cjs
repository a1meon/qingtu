const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const {createHash,sign}=require('node:crypto');
const yaml=require('js-yaml');
const {requiredFiles,sameAssets,verifyPayload}=require('./mirror-release.cjs');
const {decodeEnvelope}=require('../desktop/mac-updater.cjs');
const {verifyWindowsManifest}=require('../desktop/windows-manifest.cjs');
const {releaseKey,verifyReleaseSignature}=require('./release-key.cjs');

async function verifyFullRelease(seal=false){
 const {version}=require('../package.json');
 const dir=path.resolve('release','v'+version);
 const base='https://localhost/';
 const read=name=>fs.readFile(path.join(dir,name),'utf8');
 const stable=JSON.parse(await read('stable.json'));
 if(stable.tag_name!=='v'+version)throw new Error('发布标记版本不符');
 const windows=yaml.load(await read('latest.yml'));verifyWindowsManifest(windows);
 const macs={};
 for(const arch of ['arm64','x64']){
  macs[arch]=decodeEnvelope(JSON.parse(await read('mac-'+arch+'.json')),require('../desktop/sparkle-public-key.json').publicKey,arch,base);
  const archive=macs[arch].file;
  verifyReleaseSignature(await fs.readFile(path.join(dir,archive.url)),archive.edSignature);
 }
 const expected=requiredFiles(version,windows,macs,base);
 const sumFile='SHA256SUMS-'+version+'.txt',sigFile=sumFile+'.sig';
 sameAssets(expected,new Set((await fs.readdir(dir)).filter(name=>name!==sumFile&&name!==sigFile)));
 for(const file of [windows.files[0],macs.arm64.file,macs.x64.file])await verifyPayload(dir,file);
 const lines=[];
 for(const name of [...expected].sort()){
  const hash=createHash('sha256');
  for await(const bytes of createReadStream(path.join(dir,name)))hash.update(bytes);
  lines.push(hash.digest('hex')+'  '+name);
 }
 const text=lines.join('\n')+'\n';
 if(seal){
  await fs.writeFile(path.join(dir,sumFile),text);
  await fs.writeFile(path.join(dir,sigFile),sign(null,Buffer.from(text),await releaseKey()).toString('base64')+'\n');
 }
 if(await read(sumFile)!==text)throw new Error('SHA-256 清单与附件不匹配');
 verifyReleaseSignature(Buffer.from(text),await read(sigFile));
 console.log(version+' 完整发行包通过校验，共 '+(expected.size+2)+' 个文件。');
}
module.exports={verifyFullRelease};
if(require.main===module)verifyFullRelease(process.argv[2]==='--seal').catch(e=>{console.error(e);process.exitCode=1;});
