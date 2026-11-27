// Stage only complete platform packages and deltas into this version's release directory.
const fs = require('node:fs/promises');
const path = require('node:path');
const {sign} = require('node:crypto');
const yaml = require('js-yaml');
const {fileDigest,validateArchive} = require('../desktop/chunk-download.cjs');
const {signedBytes} = require('../desktop/windows-manifest.cjs');
const {releaseKey} = require('./release-key.cjs');
const {releaseBaseline,buildDelta} = require('./prepare-update-delta.cjs');

async function prepareFull(platform,arch) {
 const {version}=require('../package.json');
 const mac=platform==='darwin';
 if (!(mac && ['arm64','x64'].includes(arch)) && !(platform==='win32' && arch==='x64')) throw new Error('未知发行平台');
 const out=path.join('release','v'+version);
 await fs.mkdir(out,{recursive:true});
 const stem='Qingtu-'+version+'-'+(mac?'mac':'win')+'-'+arch;
 const name=stem+(mac?'.zip':'.exe');
 const archive=path.join('release',name);
 const info=yaml.load(await fs.readFile(path.join('release',mac?'latest-mac.yml':'latest.yml'),'utf8'));
 const built=info.files?.find(entry=>entry.url===name);
 const file={url:name,size:(await fs.stat(archive)).size,sha512:await fileDigest(archive)};
 if (info.version!==version || file.size!==built?.size || file.sha512!==built.sha512) throw new Error('构建文件与版本清单不符 '+name);
 validateArchive(file,'https://localhost/');
 const baseline=await releaseBaseline(archive);
 if (baseline) {
  const delta=await buildDelta(archive,file,out,baseline);
  if (delta) file.qingtuDelta=delta;
 }
 const key=await releaseKey();
 const signature=bytes=>sign(null,bytes,key).toString('base64');
 await fs.copyFile(archive,path.join(out,name));
 if(mac){
  const dmg=stem+'.dmg';
  const dmgInfo=info.files.find(entry=>entry.url===dmg);
  if (!dmgInfo || await fileDigest(path.join('release',dmg))!==dmgInfo.sha512) throw new Error('DMG 校验失败');
  await fs.copyFile(path.join('release',dmg),path.join(out,dmg));
  file.edSignature=signature(await fs.readFile(archive));
  const payload=Buffer.from(JSON.stringify({version,arch,file}));
  await fs.writeFile(path.join(out,'mac-'+arch+'.json'),JSON.stringify({payload:payload.toString('base64'),signature:signature(payload)})+'\n');
 } else {
  const manifest={version,files:[file],path:name,sha512:file.sha512,releaseDate:info.releaseDate};
  manifest.qingtuSignature=signature(signedBytes(manifest));
  await fs.writeFile(path.join(out,'latest.yml'),yaml.dump(manifest));
 }
 await fs.writeFile(path.join(out,'stable.json'),JSON.stringify({tag_name:'v'+version})+'\n');
 console.log('Ready: '+name+(file.qingtuDelta?' + '+file.qingtuDelta.size+' byte delta':''));
}
if(require.main===module)prepareFull(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
