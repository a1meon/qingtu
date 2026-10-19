const fs=require('node:fs/promises');const path=require('node:path');const {createHash,createPrivateKey,createPublicKey,sign}=require('node:crypto');const yaml=require('js-yaml');
const sha512=bytes=>createHash('sha512').update(bytes).digest('base64');
async function writeMacChannel({out,file,version,arch,channel,minimumSystemVersion,key,partSize=64*1024*1024}){
 if(!['mac','mac-light'].includes(channel)||!['arm64','x64'].includes(arch)||!/^\d+\.\d+\.\d+$/.test(version)||!/^\d+\.\d+(?:\.\d+)?$/.test(minimumSystemVersion))throw new Error('Invalid compatibility channel');
 if(!Number.isSafeInteger(partSize)||partSize<1||partSize>64*1024*1024)throw new Error('Invalid part size');
 const bytes=await fs.readFile(file),name=path.basename(file);if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.zip$/.test(name)||bytes.length<1)throw new Error('Invalid Mac archive');
 await fs.mkdir(out,{recursive:true});const parts=[];
 for(let offset=0,index=1;offset<bytes.length;offset+=partSize,index++){
  const part=bytes.subarray(offset,offset+partSize),url=bytes.length<=partSize?name:`${name}.part${String(index).padStart(2,'0')}`;
  if(path.resolve(file)!==path.resolve(out,url))await fs.writeFile(path.join(out,url),part);
  parts.push({url,size:part.length,sha512:sha512(part)});
 }
 const manifest={version,arch,minimumSystemVersion,file:{url:name,size:bytes.length,sha512:sha512(bytes),edSignature:sign(null,bytes,key).toString('base64'),qingtuParts:parts}};
 const payload=Buffer.from(JSON.stringify(manifest));await fs.writeFile(path.join(out,`${channel}-${arch}.json`),JSON.stringify({payload:payload.toString('base64'),signature:sign(null,payload,key).toString('base64')})+'\n');return manifest;
}
async function writeWindowsChannel({out,file,version}){
 const bytes=await fs.readFile(file),name=path.basename(file);if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.exe$/.test(name)||!/^\d+\.\d+\.\d+$/.test(version)||!bytes.length||bytes.length>64*1024*1024)throw new Error('Invalid lightweight installer');
 const fileInfo={url:name,size:bytes.length,sha512:sha512(bytes)};fileInfo.qingtuParts=[{...fileInfo}];
 if(path.resolve(file)!==path.resolve(out,name))await fs.copyFile(file,path.join(out,name));
 const info={version,files:[fileInfo],path:name,sha512:fileInfo.sha512,releaseDate:new Date().toISOString(),qingtuMultipart:1};await fs.writeFile(path.join(out,'latest.yml'),yaml.dump(info));return info;
}
async function prepare(version=require('../package.json').version){
 const out=path.resolve('release/lite-'+version);
 // Same trusted production identity as all previously shipped Sparkle clients.
 const seed=Buffer.from((await fs.readFile('.cache/sparkle-signing/update-seed.txt','utf8')).trim(),'base64');
 const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
 if(createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64')!==require('../desktop/sparkle-public-key.json').publicKey)throw new Error('Signing identity mismatch');
 for(const arch of ['arm64','x64']){
  await writeMacChannel({out,file:path.resolve(`release/bridge-0.4.9/${arch}/Qingtu-0.4.9-mac-${arch}.zip`),version:'0.4.9',arch,channel:'mac',minimumSystemVersion:'13.0',key});
  await writeMacChannel({out,file:path.join(out,`Qingtu-${version}-Mac-${arch}.zip`),version,arch,channel:'mac-light',minimumSystemVersion:'13.3',key});
 }
 await writeWindowsChannel({out,file:path.join(out,`Qingtu-${version}-Windows-x64-Setup.exe`),version});
 const names=(await fs.readdir(out)).filter(n=>n!=='build-report.json'&&!n.startsWith('SHA256SUMS')).sort();
 await fs.writeFile(path.join(out,`SHA256SUMS-${version}.txt`),(await Promise.all(names.map(async n=>createHash('sha256').update(await fs.readFile(path.join(out,n))).digest('hex')+'  '+n))).join('\n')+'\n');
 console.log('Legacy and lightweight update channels prepared for '+version);
}
module.exports={writeMacChannel,writeWindowsChannel,prepare};
if(require.main===module)prepare(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
