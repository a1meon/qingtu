const {EventEmitter}=require('node:events');
const {createPublicKey,verify}=require('node:crypto');
const {assembleParts,validateParts,ChunkTransport}=require('./chunk-download.cjs');
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function versionParts(value){if(typeof value!=='string'||!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(value))throw new Error('更新版本无效');return value.split('.').map(Number);}
function newer(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function systemParts(value){if(typeof value!=='string'||!/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(value)||Number(value.split('.')[0])<10)throw new Error('更新系统版本要求无效');return [...value.split('.').map(Number),0].slice(0,3);}
function requireSystem(manifest,systemVersion,required=false){
 if(manifest.minimumSystemVersion===undefined&&!required)return;
 const minimum=systemParts(manifest.minimumSystemVersion),actual=systemParts(systemVersion);
 for(let i=0;i<3;i++)if(actual[i]!==minimum[i]){
  if(actual[i]>minimum[i])return;
  const error=new Error(`轻量版需要 macOS ${manifest.minimumSystemVersion} 或更新版本，当前版本仍可继续使用`);error.code='UPDATE_OS_UNSUPPORTED';throw error;
 }
}
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
 constructor({version,arch,publicKey,cacheRoot,fetcher=fetch,native,channel='mac',systemVersion=process.getSystemVersion?.()}){super();if(!['mac','mac-light'].includes(channel))throw new Error('更新通道无效');Object.assign(this,{version,arch,publicKey,cacheRoot,fetcher,native,channel,systemVersion});}
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){
  this.manifest=null;this.staged=null;
  const response=await this.fetcher(new URL(`${this.channel}-${this.arch}.json`,this.feed.url).href,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error('更新服务暂不可用');const text=await response.text();if(text.length>100000)throw new Error('更新描述过大');
  const manifest=decodeEnvelope(JSON.parse(text),this.publicKey,this.arch,this.feed.url);
  if(newer(manifest.version,this.version)){requireSystem(manifest,this.systemVersion,this.channel==='mac-light');this.manifest=manifest;this.emit('update-available',{version:manifest.version});}else this.emit('update-not-available');
  return {updateInfo:{version:manifest.version}};
 }
 async downloadUpdate(){
  if(!this.manifest)throw new Error('请先检查新版本');const manifest=this.manifest;requireSystem(manifest,this.systemVersion,this.channel==='mac-light');
  this.staged=await assembleParts(manifest.file,this.feed.url,this.cacheRoot,{fetcher:this.fetcher,onProgress:bytes=>this.emit('download-progress',{percent:100*bytes/manifest.file.size})});
  // The authenticated manifest binds the full ZIP hash. Sparkle independently
  // verifies the original ZIP EdDSA before extracting or replacing the app.
  this.emit('update-downloaded',{version:manifest.version});return [this.staged];
 }
 async quitAndInstall(){
  if(!this.staged||!this.manifest)throw new Error('请先下载更新');requireSystem(this.manifest,this.systemVersion,this.channel==='mac-light');if(this.installing)return;
  this.installing=true;
  try{
   this.transport ||= await new ChunkTransport(this.cacheRoot,{fetcher:this.fetcher}).start();
   this.transport.reset();const fileUrl=this.transport.register(this.manifest.file,this.feed.url);
   const manifest=this.manifest;
   const minimum=manifest.minimumSystemVersion?`<sparkle:minimumSystemVersion>${xml(manifest.minimumSystemVersion)}</sparkle:minimumSystemVersion>`:'';
   const appcast=`<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>轻图</title><item><title>轻图 ${xml(manifest.version)}</title>${minimum}<enclosure url="${xml(fileUrl.href)}" sparkle:version="${xml(manifest.version)}" sparkle:shortVersionString="${xml(manifest.version)}" sparkle:edSignature="${xml(manifest.file.edSignature)}" length="${manifest.file.size}" type="application/octet-stream"/></item></channel></rss>`;
   const feedUrl=this.transport.registerText(appcast);
   await this.native.install({feedUrl:feedUrl.href,file:manifest.file,onEvent:event=>{if(event.type==='error'&&this.installing){this.installing=false;this.emit('error',new Error(event.message||'安装失败'));}}});
  }catch(error){this.installing=false;throw error;}
 }
 close(){this.transport?.close();}
}
module.exports={MacUpdater,decodeEnvelope,newer};
