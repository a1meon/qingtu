function httpsUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('更新地址须为 HTTPS');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('更新地址须为无凭据的 HTTPS 地址');
 return url;
}
async function resolveUpdateFeed(config,platform,arch,requestJson){
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
  const release=await requestJson(`https://gitee.com/api/v5/repos/${config.owner}/${config.repo}/releases/latest`);
  if(!release?.tag_name||release.prerelease||typeof release.tag_name!=='string')throw new Error('没有可用的正式发行版');
  // Tags are one URL segment: escape slashes, spaces and query characters.
  return {provider:'generic',url:`https://gitee.com/${config.owner}/${config.repo}/releases/download/${encodeURIComponent(release.tag_name)}/`,channel:platform==='darwin'?`latest-${arch}`:'latest',useMultipleRangeRequest:false};
 }
 throw new Error('更新源类型无效');
}
module.exports={resolveUpdateFeed,httpsUrl};
