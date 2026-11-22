const {EventEmitter}=require('node:events');
const offline=error=>/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONN|ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION|TIMED_OUT)/.test(`${error?.code||''} ${error?.message||''}`);
class UpdateController extends EventEmitter {
 constructor({version,updater,resolveFeed,development=false,canInstall=()=>true}){
  super();this.development=development;this.updater=updater;this.resolveFeed=resolveFeed;this.canInstall=canInstall;
  this.state={version,phase:'idle',visible:false,availableVersion:null,percent:0};
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
  updater.on('update-available',info=>this.set({phase:'available',availableVersion:info.version,visible:true}));
  updater.on('update-not-available',()=>this.set({phase:'current',availableVersion:null,visible:this.manual}));
  updater.on('download-progress',p=>this.set({phase:'downloading',percent:Math.max(this.state.phase==='downloading'?this.state.percent:0,Math.min(100,Math.round(Number(p.percent)||0)))}));
  updater.on('update-downloaded',info=>this.set({phase:'ready',availableVersion:info.version,percent:100,visible:true}));
  // Updater emits errors as well as rejecting its operation. Always handle it.
  updater.on('error',error=>this.failed(error));
 }
 status(){return {...this.state};}
 set(patch){this.state={...this.state,...patch};this.emit('state',this.status());return this.status();}
 failed(error){
  const downloading=this.downloading||this.state.phase==='downloading',installing=this.state.phase==='installing'||this.state.failureStage==='install';
  return this.set({failureStage:installing?'install':null,phase:!downloading&&offline(error)?'offline':'error',visible:!!(this.manual||downloading||installing),message:installing?'更新安装失败，请重试':downloading?'下载失败，请重试':offline(error)?'无法连接更新服务，请联网后重试':'检查失败，请稍后重试'});
 }
 check(manual=false){
  if(this.development)return Promise.resolve(this.set({phase:'development',visible:manual}));
  this.manual=!!(manual||this.checking&&this.manual);
  if(['available','downloading','ready','installing'].includes(this.state.phase))return Promise.resolve(this.set({visible:manual||this.state.visible}));
  if(this.checking){if(manual)this.set({visible:true});return this.checking;}
  this.set({phase:'checking',visible:manual,message:null,failureStage:null,availableVersion:null,percent:0});
  this.checking=Promise.resolve().then(async()=>{
   const feed=await this.resolveFeed();
   if(!feed)return this.set({phase:'unconfigured',visible:this.manual,message:'更新源尚未配置'});
   this.updater.setFeedURL(feed);await this.updater.checkForUpdates();return this.status();
  }).catch(error=>this.failed(error)).finally(()=>{this.checking=null;});
  return this.checking;
 }
 download(){
  if(this.downloading)return this.downloading;
  if(!this.state.availableVersion||!['available','error'].includes(this.state.phase))return Promise.reject(new Error('请先检查新版本'));
  this.set({phase:'downloading',visible:true,percent:0,message:null,failureStage:null});
  this.downloading=Promise.resolve().then(()=>this.updater.downloadUpdate()).then(()=>this.status()).catch(error=>this.failed(error)).finally(()=>{this.downloading=null;});
  return this.downloading;
 }
 install(){
  if(this.state.phase!=='ready')throw new Error('请先下载更新');
  if(!this.canInstall())throw new Error('图片正在处理，请完成后再重启');
  this.set({phase:'installing',visible:true});
  try{const result=this.updater.quitAndInstall(true,true);return result?.then?result.then(()=>this.status()).catch(error=>{this.failed(error);throw error;}):this.status();}catch(error){this.failed(error);throw error;}
 }
}
module.exports={UpdateController};
