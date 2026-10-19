// Verify local or anonymously downloaded release attachments without installation.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,createPublicKey,verify}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {decodeEnvelope}=require('../desktop/mac-updater.cjs');const yaml=require('js-yaml');
const hash=(b,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(b).digest(encoding);
(async()=>{
 const version=require('../package.json').version,out=path.resolve(process.argv[2]||'release/lite-'+version),cache=path.resolve('.cache/release-verify-'+version);await fs.mkdir(cache,{recursive:true});
 const sum=await fs.readFile(path.join(out,`SHA256SUMS-${version}.txt`),'utf8'),files=[];
 for(const line of sum.trim().split('\n')){const name=line.slice(66);assert.match(name,/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);const bytes=await fs.readFile(path.join(out,name));assert.equal(hash(bytes),line.slice(0,64),name);files.push({name,bytes:bytes.length,sha256:hash(bytes)});}
 const publicKey=require('../desktop/sparkle-public-key.json').publicKey,channels=[];
 // The official verifier accepts the historical 96-byte key container. In
 // --verify mode only its last32 public bytes are used; no private key is read.
 const verificationInput=Buffer.concat([Buffer.alloc(64),Buffer.from(publicKey,'base64')]).toString('base64');
 for(const channel of ['mac','mac-light'])for(const arch of ['arm64','x64']){
  const manifest=decodeEnvelope(JSON.parse(await fs.readFile(path.join(out,`${channel}-${arch}.json`),'utf8')),publicKey,arch,'https://gitee.com/a1meon_admin/halframe-releases/releases/download/v'+version+'/');
  assert.equal(manifest.version,channel==='mac'?'0.4.9':version);assert.equal(manifest.minimumSystemVersion,channel==='mac'?'13.0':'13.3');
  const pieces=[];for(const part of manifest.file.qingtuParts){const bytes=await fs.readFile(path.join(out,part.url));assert.equal(bytes.length,part.size);assert.equal(hash(bytes,'sha512','base64'),part.sha512);pieces.push(bytes);}const bytes=Buffer.concat(pieces);assert.equal(bytes.length,manifest.file.size);assert.equal(hash(bytes,'sha512','base64'),manifest.file.sha512);
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey,'base64')]),format:'der',type:'spki'});assert.equal(verify(null,bytes,key,Buffer.from(manifest.file.edSignature,'base64')),true);
  const archive=path.join(cache,`${channel}-${arch}.zip`);await fs.writeFile(archive,bytes);const check=spawnSync('.cache/sparkle/bin/sign_update',['--verify','--ed-key-file','-',archive,manifest.file.edSignature],{input:verificationInput,encoding:'utf8'});assert.equal(check.status,0,'Official Sparkle verification failed');
  const inspect=spawnSync('python3',['-c',"import zipfile,plistlib,json,sys;z=zipfile.ZipFile(sys.argv[1]);p=next(n for n in z.namelist() if n.count('/')==2 and n.endswith('/Contents/Info.plist'));d=plistlib.loads(z.read(p));print(json.dumps({k:d.get(k) for k in ['CFBundleIdentifier','CFBundleShortVersionString','LSMinimumSystemVersion','SUPublicEDKey']}))",archive],{encoding:'utf8'});assert.equal(inspect.status,0);const plist=JSON.parse(inspect.stdout);assert.equal(plist.CFBundleIdentifier,'com.qingtu.desktop');assert.equal(plist.CFBundleShortVersionString,manifest.version);assert.equal(plist.LSMinimumSystemVersion,manifest.minimumSystemVersion);assert.equal(plist.SUPublicEDKey,publicKey);
  channels.push({channel,arch,version:manifest.version,minimumSystemVersion:manifest.minimumSystemVersion,archiveBytes:bytes.length,officialSparkleSignature:true});
 }
 const windows=yaml.load(await fs.readFile(path.join(out,'latest.yml'),'utf8'));assert.equal(windows.version,version);const exe=await fs.readFile(path.join(out,windows.files[0].url));assert.equal(exe.length,windows.files[0].size);assert.equal(hash(exe,'sha512','base64'),windows.files[0].sha512);assert.equal(windows.files[0].qingtuParts[0].url,windows.files[0].url);assert.equal(exe.readUInt16LE(0),0x5a4d);
 const report={version,attachments:files.length+1,bytes:files.reduce((s,f)=>s+f.bytes,Buffer.byteLength(sum)),files,channels,windows:{version,bytes:exe.length,sha512:windows.files[0].sha512},privateSigningMaterialRead:false};await fs.writeFile(path.join(cache,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version,attachments:report.attachments,bytes:report.bytes,allHashes:true,officialSparkleSignatures:channels.length,privateSigningMaterialRead:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
