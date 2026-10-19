// Check the real latest endpoint with the updater extracted from shipped0.4.8.
// Read metadata only; downloads are independently verified and no install runs.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
(async()=>{
 const version=require('../package.json').version,root=path.resolve('.cache/frozen-legacy-updater');await fs.mkdir(root,{recursive:true});
 const archive='release/mac-arm64/轻图.app/Contents/Resources/app.asar';
 for(const name of ['mac-updater.cjs','chunk-download.cjs','update-source.cjs'])await fs.writeFile(path.join(root,name),asar.extractFile(archive,'desktop/'+name));
 const {MacUpdater:LegacyMacUpdater}=require(path.join(root,'mac-updater.cjs')),{resolveUpdateFeed}=require(path.join(root,'update-source.cjs')),{MacUpdater}=require('../desktop/mac-updater.cjs');
 const requests=[],responses=new Map();async function fetcher(url,options){if(!responses.has(url)){const r=await fetch(url,options);assert.equal(r.status,200,url);responses.set(url,await r.text());requests.push(url);}return new Response(responses.get(url),{status:200});}
 const api='https://gitee.com/api/v5/repos/a1meon_admin/halframe-releases/releases/latest',release=await(await fetcher(api)).json();assert.equal(release.tag_name,'v'+version);assert.equal(release.prerelease,false);
 await fs.writeFile(path.join('release','remote-v'+version.replaceAll('.',''),'release.json'),JSON.stringify(release,null,2));
 const cases=[],publicKey=require('../desktop/sparkle-public-key.json').publicKey,native={install:()=>{throw Error('Installation forbidden in metadata verification');}};
 for(const arch of ['arm64','x64']){
  const feed=await resolveUpdateFeed(require('../desktop/update-source.json'),'darwin',arch,async()=>release),old=new LegacyMacUpdater({version:'0.4.6',arch,publicKey,cacheRoot:root,native,fetcher});old.setFeedURL(feed);let available;old.on('update-available',i=>available=i.version);await old.checkForUpdates();assert.equal(available,'0.4.9');assert.equal(old.staged,null);
  for(const systemVersion of ['13.2.1','13.3.0']){const bridge=new MacUpdater({version:'0.4.9',arch,publicKey,cacheRoot:root,native,fetcher,channel:'mac-light',systemVersion});bridge.setFeedURL(feed);
   if(systemVersion==='13.2.1'){await assert.rejects(bridge.checkForUpdates(),e=>e.code==='UPDATE_OS_UNSUPPORTED');assert.equal(bridge.manifest,null);}else{await bridge.checkForUpdates();assert.equal(bridge.manifest.version,version);}
   cases.push({arch,legacy:'0.4.6',bridge:'0.4.9',systemVersion,result:systemVersion==='13.2.1'?'retains-working-bridge':version});
  }
 }
 assert.ok(requests.every(u=>u===api||u.endsWith('.json')));const report={version,tag:release.tag_name,releaseId:release.id,prerelease:release.prerelease,realLatestEndpoint:true,frozenShippedUpdater:true,cases,networkRequests:requests.length,downloads:0,installerExecuted:false};await fs.writeFile(path.join('docs/legacy-update-validation',`live-legacy-${version}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
