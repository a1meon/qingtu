import {ed25519} from '@noble/curves/ed25519.js';
import {Buffer} from 'buffer';
import publicKey from '../../desktop/sparkle-public-key.json' with {type:'json'};
import pkg from '../../package.json' with {type:'json'};
const base='https://gitee.com/a1meon_admin/halframe-releases/';
export function newer(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);return x.some((n,i)=>n>y[i]&&x.slice(0,i).every((p,j)=>p===y[j]));}
export function decodeManifest(envelope,platform,arch){
 if(typeof envelope?.payload!=='string'||envelope.payload.length>90000)throw new Error('更新描述无效');
 const bytes=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature||'','base64');
 if(!ed25519.verify(signature,bytes,Buffer.from(publicKey.publicKey,'base64')))throw new Error('更新签名验证失败');
 const manifest=JSON.parse(bytes.toString());
 if(!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(manifest.version)||manifest.platform!==platform||manifest.arch!==arch)throw new Error('更新版本或平台无效');
 const file=manifest.file;if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>300000000||!/^[a-f0-9]{64}$/.test(file.sha256)||!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(dmg|exe)$/.test(file.name))throw new Error('更新安装包无效');
 return manifest;
}
export function initializeUpdater(ctx,currentVersion=pkg.version){
 const {api,native,N,info,flush,setState}=ctx,platform=api.platform,arch=info.arch==='amd64'?'x64':info.arch;
 let state={version:currentVersion,phase:'idle',visible:false},manifest,releaseBase,staged,checking,downloading,lastFailure=0,cached,currentOperations=0;
 const set=patch=>{state={...state,...patch};setState(state);return state;};
 for(const method of ['process','save','stitchRender','stitchSave','stitchImport','stitchChooseFiles','chooseFiles','importFiles']){const original=api[method];api[method]=async(...args)=>{if(state.phase==='installing'&&!['stitchSave','stitchRender'].includes(method))throw new Error('正在安装更新');currentOperations++;try{return await original(...args);}finally{currentOperations--;}};}
 api.updateStatus=async()=>state;
 api.checkUpdate=async(manual=true)=>{
  if(['available','downloading','ready','installing'].includes(state.phase))return set({visible:manual||state.visible});
  if(checking)return checking;
  if(Date.now()-lastFailure<60000)return set({phase:'error',visible:manual,message:'更新服务暂不可用，请一分钟后重试'});
  set({phase:'checking',visible:manual,message:null});
  checking=(async()=>{try{
   const releases=cached?.until>Date.now()?cached.value:JSON.parse(await native('fetchText','https://gitee.com/api/v5/repos/a1meon_admin/halframe-releases/releases?per_page=20&page=1'));
   if(!Array.isArray(releases))throw new Error('更新服务返回无效');cached={value:releases,until:Date.now()+600000};
   const candidates=releases.filter(r=>!r.prerelease&&/^v?\d+\.\d+\.\d+$/.test(r.tag_name)).sort((a,b)=>newer(a.tag_name.replace(/^v/,''),b.tag_name.replace(/^v/,''))?-1:1);
   const latest=candidates[0];if(!latest||!newer(latest.tag_name.replace(/^v/,''),currentVersion))return set({phase:'current',availableVersion:null});
   releaseBase=base+'releases/download/'+encodeURIComponent(latest.tag_name)+'/';
   manifest=decodeManifest(JSON.parse(await native('fetchText',releaseBase+`lite-${platform}-${arch}.json`)),platform,arch);
   if(!newer(manifest.version,currentVersion))return set({phase:'current',availableVersion:null});
   return set({phase:'available',availableVersion:manifest.version,visible:true});
  }catch(error){lastFailure=Date.now();return set({phase:'error',message:/HTTP 403|HTTP 429/.test(error.message)?'Gitee 暂时限制请求，请一分钟后重试':'无法连接更新服务，请稍后重试'});}finally{checking=null;}})();return checking;
 };
 api.downloadUpdate=async()=>{if(downloading)return downloading;if(!manifest)throw new Error('请先检查新版本');set({phase:'downloading',percent:0});downloading=(async()=>{try{const cache=(await N.os.getPath('cache'))+'/Qingtu/updates';staged=await native('download',releaseBase+manifest.file.name,cache+'/'+manifest.file.name,manifest.file.sha256,manifest.file.size);return set({phase:'ready',percent:100,installLabel:platform==='darwin'?'打开安装包':'安装并重启',manualInstall:platform==='darwin'});}catch(e){return set({phase:'error',message:'下载或校验失败，请重试'});}finally{downloading=null;}})();return downloading;};
 api.installUpdate=async()=>{if(!staged||state.phase!=='ready')throw new Error('请先下载更新');if(currentOperations)throw new Error('请等待处理和保存完成');set({phase:'installing'});const element=globalThis.document?.getElementById('root');if(element)element.inert=true;try{await flush();await N.os.open(staged);if(platform==='win32'){await ctx.close();return set({phase:'ready'});}return set({phase:'ready',message:null,manualInstall:true,installLabel:'再次打开安装包'});}catch(error){set({phase:'ready'});throw error;}finally{if(element)element.inert=false;}};
 if(!globalThis.NL_ARGS?.includes('--qingtu-smoke'))setTimeout(()=>api.checkUpdate(false),3000);
}
