const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {generateKeyPairSync,verify}=require('node:crypto');
test('legacy feeds bind bridge and light packages independently; parts retain exact archive signatures',async t=>{
 const {writeMacChannel,writeWindowsChannel}=require('../scripts/prepare-legacy-update.cjs');
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-legacy-'));t.after(()=>fs.rm(out,{recursive:true,force:true}));const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 for(const [channel,version,min]of [['mac','0.4.9','13.0'],['mac-light','0.5.1','13.3']]){
  const file=path.join(out,`Qingtu-${version}-Mac-arm64.zip`),bytes=Buffer.from('actual archive '+version);await fs.writeFile(file,bytes);
  const manifest=await writeMacChannel({out,file,version,arch:'arm64',channel,minimumSystemVersion:min,key:privateKey,partSize:8});
  const envelope=JSON.parse(await fs.readFile(path.join(out,channel+'-arm64.json'),'utf8')),payload=Buffer.from(envelope.payload,'base64');assert.equal(verify(null,payload,publicKey,Buffer.from(envelope.signature,'base64')),true);assert.deepEqual(JSON.parse(payload),manifest);
  assert.equal(manifest.minimumSystemVersion,min);assert.equal(verify(null,bytes,publicKey,Buffer.from(manifest.file.edSignature,'base64')),true);
  assert.deepEqual(Buffer.concat(await Promise.all(manifest.file.qingtuParts.map(p=>fs.readFile(path.join(out,p.url))))),bytes);
 }
 const installer=path.join(out,'Qingtu-0.5.1-Windows-x64-Setup.exe');await fs.writeFile(installer,'actual EXE');const info=await writeWindowsChannel({out,file:installer,version:'0.5.1'});assert.equal(info.files[0].qingtuParts[0].url,path.basename(installer));assert.equal(info.files[0].size,10);
});
