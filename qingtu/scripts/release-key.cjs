const fs=require('node:fs/promises');
const {createPrivateKey,createPublicKey,verify}=require('node:crypto');
const {prepareKey}=require('./prepare-sparkle-key.cjs');
async function releaseKey(){
 const {keyPath}=await prepareKey();
 const seed=Buffer.from((await fs.readFile(keyPath,'utf8')).trim(),'base64');
 return createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
}
function verifyReleaseSignature(data,signature){
 const raw=Buffer.from(require('../desktop/sparkle-public-key.json').publicKey,'base64');
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
 if(!verify(null,data,key,Buffer.from(signature.trim(),'base64')))throw new Error('发行附件签名验证失败');
}
module.exports={releaseKey,verifyReleaseSignature};
