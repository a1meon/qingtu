const {createPublicKey,verify} = require('node:crypto');
const {publicKey} = require('./sparkle-public-key.json');
function signedBytes(info) {
 return Buffer.from(JSON.stringify({version:info.version,files:info.files}));
}
function verifyWindowsManifest(info,rawKey=publicKey) {
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(rawKey,'base64')]),format:'der',type:'spki'});
 if (info.files?.length!==1 || info.files[0].url!=='Qingtu-'+info.version+'-win-x64.exe' || info.packages ||
     !verify(null,signedBytes(info),key,Buffer.from(info.qingtuSignature||'','base64'))) throw new Error('Windows 更新清单签名或平台无效');
}
module.exports={signedBytes,verifyWindowsManifest};
