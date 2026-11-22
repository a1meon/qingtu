const {EventEmitter}=require('node:events');
const {createPublicKey,verify}=require('node:crypto');
const {assembleParts,validateParts,ChunkTransport}=require('./chunk-download.cjs');
const {fromMirrors,preferredUrls}=require('./update-source.cjs');
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function versionParts(value){if(typeof value!=='string'||!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(value))throw new Error('更新版本无效');return value.split('.').map(Number);}
function newer(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function decodeEnvelope(envelope,publicKey,arch,base){
 if(typeof envelope?.payload!=='string'||envelope.payload.length>90000||typeof envelope.signature!=='string')throw new Error('更新清单签名无效');
 const payload=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature,'base64');
 const raw=Buffer.from(publicKey,'base64');if(raw.length!==32)throw new Error('更新公钥无效');
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
 if(signature.length!==64||!verify(null,payload,key,signature))throw new Error('更新清单签名验证失败');
 const manifest=JSON.parse(payload);versionParts(manifest.version);
 if(manifest.arch!==arch)throw new Error('更新架构不匹配');
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.zip$/.test(manifest.file?.url)||Buffer.from(manifest.file?.edSignature||'','base64').length!==64)throw new Error('更新包签名或名称无效');
 validateParts(manifest.file,base);return manifest;
}
class MacUpdater extends EventEmitter {
 constructor({version,arch,publicKey,cacheRoot,baseFiles=[],fetcher=fetch,native}){super();Object.assign(this,{version,arch,publicKey,cacheRoot,baseFiles,fetcher,native});}
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){
  this.manifest=null;this.staged=null;
  const manifest=await fromMirrors(preferredUrls(this.feed),async base=>{
   const response=await this.fetcher(new URL(`mac-${this.arch}.json`,base).href,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
   if(!response.ok)throw new Error('更新服务暂不可用');
   const text=await response.text();if(text.length>100000)throw new Error('更新描述过大');
   const info=decodeEnvelope(JSON.parse(text),this.publicKey,this.arch,base);
   if(this.feed.releaseVersion&&info.version!==this.feed.releaseVersion)throw new Error('更新清单版本不匹配');
   this.sources=preferredUrls(this.feed,base);
   return info;
  });
  if(newer(manifest.version,this.version)){this.manifest=manifest;this.emit('update-available',{version:manifest.version});}else this.emit('update-not-available');
  return {updateInfo:{version:manifest.version}};
 }
 async downloadUpdate(){
  if(!this.manifest)throw new Error('请先检查新版本');const manifest=this.manifest;
  this.staged=await assembleParts(manifest.file,this.sources[0],this.cacheRoot,{mirrorUrls:this.sources.slice(1),fetcher:this.fetcher,baseFiles:this.baseFiles,onProgress:(bytes,total=manifest.file.size,mode)=>this.emit('download-progress',{percent:100*bytes/total,total,mode})});
  // The authenticated manifest binds the full ZIP hash. Sparkle independently
  // verifies the original ZIP EdDSA before extracting or replacing the app.
  this.emit('update-downloaded',{version:manifest.version});return [this.staged];
 }
 async quitAndInstall(){
  if(!this.staged||!this.manifest)throw new Error('请先下载更新');if(this.installing)return;
  this.installing=true;
  try{
   this.transport ||= await new ChunkTransport(this.cacheRoot,{fetcher:this.fetcher}).start();
   this.transport.reset();const fileUrl=this.transport.register(this.manifest.file,this.sources[0],undefined,this.sources.slice(1));
   const manifest=this.manifest;
   const appcast=`<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>轻图</title><item><title>轻图 ${xml(manifest.version)}</title><enclosure url="${xml(fileUrl.href)}" sparkle:version="${xml(manifest.version)}" sparkle:shortVersionString="${xml(manifest.version)}" sparkle:edSignature="${xml(manifest.file.edSignature)}" length="${manifest.file.size}" type="application/octet-stream"/></item></channel></rss>`;
   const feedUrl=this.transport.registerText(appcast);
   await this.native.install({feedUrl:feedUrl.href,file:manifest.file,onEvent:event=>{if(event.type==='error'&&this.installing){this.installing=false;this.emit('error',new Error(event.message||'安装失败'));}}});
  }catch(error){this.installing=false;throw error;}
 }
 close(){this.transport?.close();}
}
module.exports={MacUpdater,decodeEnvelope,newer};
