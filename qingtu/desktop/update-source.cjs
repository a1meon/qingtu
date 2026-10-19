function httpsUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('更新地址须为 HTTPS');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('更新地址须为无凭据的 HTTPS 地址');
 return url;
}
async function resolveUpdateFeed(config,platform,arch,requestJson,requestText){
 if(!config)return null;
 if(!['darwin','win32'].includes(platform)||!['arm64','x64'].includes(arch))throw new Error('此平台暂不支持自动更新');
 if(config.provider==='generic'){
  if(!config.url)return null;
  const url=httpsUrl(config.url);if(!url.pathname.endsWith('/'))url.pathname+='/';
  return {provider:'generic',url:new URL(`${platform==='darwin'?'mac':'win'}-${arch}/`,url).href,useMultipleRangeRequest:false};
 }
 if(config.provider==='gitee'){
  if(!config.owner||!config.repo)return null;
  if(![config.owner,config.repo].every(value=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(value)&&value!=='.'&&value!=='..'))throw new Error('Gitee 仓库地址无效');
  const repository=`https://gitee.com/${config.owner}/${config.repo}/`;
  let envelope,tag;
  try{envelope=await requestJson(repository+`raw/main/updates/stable/lite-${platform}-${arch}.json`);}
  catch(error){
   if(!requestText)throw error;
   tag=(await import('../engine/update-discovery.mjs')).formalReleaseFromPage(await requestText(repository+'releases/latest'),repository).tag;
  }
  if(!tag){
   const {verify,createPublicKey}=require('node:crypto'),key=require('./sparkle-public-key.json').publicKey;
   if(typeof envelope?.payload!=='string'||envelope.payload.length>90000)throw Error('更新描述无效');
   const payload=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature||'','base64');
   const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'base64')]),format:'der',type:'spki'});
   if(signature.length!==64||!verify(null,payload,publicKey,signature))throw Error('更新签名验证失败');
   const manifest=JSON.parse(payload);
   if(!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(manifest.version)||manifest.platform!==platform||manifest.arch!==arch)throw Error('更新版本或平台无效');
   tag='v'+manifest.version;
  }
  return {provider:'generic',url:`https://gitee.com/${config.owner}/${config.repo}/releases/download/${encodeURIComponent(tag)}/`,channel:platform==='darwin'?`latest-${arch}`:'latest',useMultipleRangeRequest:false};
 }
 throw new Error('更新源类型无效');
}
module.exports={resolveUpdateFeed,httpsUrl};
