const fs=require('node:fs/promises');const path=require('node:path');const {generateKeyPairSync,createPrivateKey,createPublicKey}=require('node:crypto');
async function prepareKey(root='.cache/sparkle-signing',publicPath='desktop/sparkle-public-key.json'){
 await fs.mkdir(root,{recursive:true,mode:0o700});await fs.chmod(root,0o700);const file=path.join(root,'update-seed.txt');let seed;
 if(process.env.QINGTU_SPARKLE_SEED){const imported=Buffer.from(process.env.QINGTU_SPARKLE_SEED.trim(),'base64');if(imported.length!==32)throw new Error('Invalid imported signing seed');try{await fs.access(file);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(file,imported.toString('base64')+'\n',{flag:'wx',mode:0o600});}}
 try{seed=Buffer.from((await fs.readFile(file,'utf8')).trim(),'base64');if(seed.length!==32)throw new Error('Invalid existing signing key');}
 catch(error){if(error.code!=='ENOENT')throw error;try{await fs.access(publicPath);throw new Error('更新私钥丢失，请从备份恢复，不能重新生成');}catch(check){if(check.code!=='ENOENT')throw check;}const pair=generateKeyPairSync('ed25519');seed=pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32);await fs.writeFile(file,seed.toString('base64')+'\n',{flag:'wx',mode:0o600});}
 await fs.chmod(file,0o600);const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
 const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 try{const old=JSON.parse(await fs.readFile(publicPath,'utf8'));if(old.publicKey!==publicKey)throw new Error('Signing key differs from the existing trusted public key');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(publicPath,JSON.stringify({publicKey},null,2)+'\n');}
 return {publicKey,keyPath:file};
}
module.exports={prepareKey};if(require.main===module)prepareKey().then(()=>console.log('Sparkle signing key ready; private seed remains local')).catch(error=>{console.error(error.message);process.exitCode=1;});
