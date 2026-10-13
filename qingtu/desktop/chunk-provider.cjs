const {GenericProvider}=require('electron-updater/out/providers/GenericProvider');
const {validateParts}=require('./chunk-download.cjs');
class GiteeChunkProvider extends GenericProvider {
 constructor(options,updater,runtimeOptions){super(options,updater,{...runtimeOptions,isUseMultipleRangeRequest:false});this.transport=options.transport;this.updater=updater;this.feed=options.url;}
 async getLatestVersion(){
  const info=await super.getLatestVersion();
  if(!Array.isArray(info.files)||info.files.length>16)throw new Error('更新文件列表无效');
  for(const file of info.files)if(file.qingtuParts){validateParts(file,this.feed);this.updater.disableDifferentialDownload=true;}
  return info;
 }
 resolveFiles(info){
  const files=super.resolveFiles(info);this.transport.reset();
  return files.map(file=>{
   if(!file.info.qingtuParts)return file;
   this.updater.disableDifferentialDownload=true;
   return {...file,url:this.transport.register(file.info,this.feed,transferred=>this.updater.emit('download-progress',{total:file.info.size,transferred,percent:100*transferred/file.info.size,bytesPerSecond:0}))};
  });
 }
}
module.exports={GiteeChunkProvider};
