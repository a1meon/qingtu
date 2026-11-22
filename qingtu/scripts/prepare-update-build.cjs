const fs=require('node:fs/promises');
const path=require('node:path');
const {httpsUrl}=require('../desktop/update-source.cjs');
function updateBuild(source,pkg,platform,arch,publicKey){
 const target=`${platform==='darwin'?'mac':'win'}-${arch}`;
 if(!['darwin','win32'].includes(platform)||!['arm64','x64'].includes(arch))throw new Error('不支持的构建平台');
 let url;
 if(source.provider==='gitee'&&source.owner&&source.repo){
  if(![source.owner,source.repo].every(v=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(v)&&v!=='.'&&v!=='..'))throw new Error('Gitee 仓库地址无效');
  url=`https://gitee.com/${source.owner}/${source.repo}/releases/download/v${pkg.version}/`;
 }else if(source.provider==='generic'&&source.url){
  const base=httpsUrl(source.url);if(!base.pathname.endsWith('/'))base.pathname+='/';url=new URL(target+'/',base).href;
 }else if(source.owner||source.repo||source.url)throw new Error('更新源配置不完整');
 const nativePackages=['sharp-darwin-arm64','sharp-libvips-darwin-arm64','sharp-darwin-x64','sharp-libvips-darwin-x64','sharp-win32-x64'];
 const own=platform==='darwin'?[`sharp-darwin-${arch}`,`sharp-libvips-darwin-${arch}`]:[`sharp-win32-${arch}`];
 // React/icons are already bundled by Vite. Keep only this platform's native
 // image runtime; foreign shared libraries cannot run here and inflate updates.
 const excluded=nativePackages.filter(name=>!own.includes(name)).map(name=>`!node_modules/@img/${name}/**/*`);
 const config={...pkg.build,extends:null,compression:'maximum',electronLanguages:['en','en-US','zh-CN','zh-TW'],files:[...(pkg.build.files||[]),...excluded,'!node_modules/react/**/*','!node_modules/react-dom/**/*','!node_modules/@phosphor-icons/react/**/*'],extraResources:[{from:'build/update-source.json',to:'qingtu-update-source.json'}],publish:url?[{provider:'generic',url,useMultipleRangeRequest:false}]:null};
 if(url&&platform==='darwin'&&publicKey){
  if(Buffer.from(publicKey,'base64').length!==32)throw new Error('Invalid Sparkle public key');
  config.mac={...config.mac,identity:'-',hardenedRuntime:false,notarize:false,extendInfo:{...config.mac?.extendInfo,SUPublicEDKey:publicKey,SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUAllowsAutomaticUpdates:false,SUVerifyUpdateBeforeExtraction:true,SUEnableInstallerLauncherService:false,SUEnableDownloaderService:false,NSAppTransportSecurity:{NSAllowsLocalNetworking:true}}};
  config.afterPack='./scripts/stage-sparkle.cjs';config.extraResources.push({from:`build/sparkle/qingtu-sparkle-${arch}.node`,to:`qingtu-sparkle-${arch}.node`});
 }else if(url&&platform==='darwin'){config.mac={...config.mac};delete config.mac.identity;}
 return {config,url,target};
}
async function prepare(platform,arch){
 const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
 let source=JSON.parse(await fs.readFile('desktop/update-source.json','utf8'));
 if(process.env.QINGTU_UPDATE_GITEE){const parts=process.env.QINGTU_UPDATE_GITEE.split('/');if(parts.length!==2)throw new Error('仓库格式为 owner/repo');if(source.provider!=='gitee'||source.owner!==parts[0]||source.repo!==parts[1])source={provider:'gitee',owner:parts[0],repo:parts[1]};}
 if(process.env.QINGTU_UPDATE_URL)source={provider:'generic',url:process.env.QINGTU_UPDATE_URL};
 const publicKey=platform==='darwin'?JSON.parse(await fs.readFile('desktop/sparkle-public-key.json','utf8')).publicKey:undefined;
 const build=updateBuild(source,pkg,platform,arch,publicKey);
 await fs.mkdir('build',{recursive:true});
 await fs.writeFile('build/update-source.json',JSON.stringify(source,null,2)+'\n');
 await fs.writeFile('build/update-builder.json',JSON.stringify(build.config,null,2)+'\n');
 console.log(build.url?'Update feed configured for '+build.target:'No update source configured; offline-capable build');
 return build;
}
module.exports={updateBuild,prepare};
if(require.main===module)prepare(...process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
