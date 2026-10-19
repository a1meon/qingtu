const {app}=require('electron');const {EventEmitter}=require('node:events');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {start}=require('./main.cjs');
class UpdateFixture extends EventEmitter {
 checks=0;downloads=0;installs=0;offline=true;
 setFeedURL(feed){this.feed=feed;}
 async checkForUpdates(){this.checks++;if(this.offline)throw Object.assign(new Error('offline'),{code:'ENOTFOUND'});this.emit('update-available',{version:'0.5.0'});return {};}
 async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:42});await new Promise(r=>this.finish=r);this.emit('update-downloaded',{version:'0.5.0'});return [];}
 quitAndInstall(silent,relaunch){assert.equal(silent,true);assert.equal(relaunch,true);this.installs++;}
}
async function waitFor(win,expression){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+expression);}
(async()=>{
 const adapter=new UpdateFixture();const {win,updater}=await start({offscreen:true,hidden:true,updater:adapter,resolveUpdateFeed:async()=>({provider:'generic',url:'https://updates.example.test/'})});
 win.webContents.setBackgroundThrottling(false);
 const js=code=>win.webContents.executeJavaScript(code);
 await waitFor(win,"!!document.querySelector('.version-button')");
 await new Promise(r=>setTimeout(r,150));assert.equal(updater.status().phase,'offline');assert.equal(await js("document.querySelector('.update-dialog').open"),false,'offline startup stays quiet');
 await js("document.querySelector('.version-button').click()");await waitFor(win,"document.querySelector('#update-title')?.textContent==='暂时无法连接'");
 adapter.offline=false;await js("document.querySelector('.update-actions .primary').click()");
 await waitFor(win,"document.querySelector('#update-title')?.textContent==='发现新版本'");assert.equal(adapter.downloads,0);
 await js("document.querySelector('.update-secondary').click()");assert.equal(await js("document.querySelector('.update-dialog').open"),false);assert.equal(adapter.downloads,0);
 await js("document.querySelector('.version-button').click()");await waitFor(win,"document.querySelector('.update-dialog').open");
 await new Promise(r=>setTimeout(r,320));
 await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});await fs.writeFile(path.join(__dirname,'../artifacts/update-available.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('.update-actions .primary').click()");await waitFor(win,"document.querySelector('progress')?.value===42");assert.equal(adapter.downloads,1);assert.equal(adapter.installs,0);
 await js("document.querySelector('.update-secondary').click()");adapter.finish();await waitFor(win,"document.querySelector('#update-title')?.textContent==='更新已就绪'&&document.querySelector('.update-dialog').open");
 await new Promise(r=>setTimeout(r,320));
 await fs.writeFile(path.join(__dirname,'../artifacts/update-ready.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(adapter.installs,0);await js("document.querySelector('.update-actions .primary').click()");await waitFor(win,"document.querySelector('#update-title')?.textContent==='正在安装更新'");assert.equal(adapter.installs,1);await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 await js("document.querySelector('.update-close').click()");await new Promise(r=>setTimeout(r,50));assert.equal(await js("document.querySelector('.update-dialog').open"),false);
 await js("document.querySelector('.version-button').click()");await waitFor(win,"document.querySelector('.update-dialog').open");
 assert.equal(await js("document.querySelector('.update-dialog').contains(document.activeElement)"),true,'dialog owns keyboard focus');
 await js("document.querySelector('.update-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))");assert.equal(await js("document.querySelector('.update-dialog').open"),false);
 console.log(JSON.stringify({passed:true,offlineStartupSilent:true,manualRetry:true,consentBeforeDownload:true,backgroundDownload:true,explicitRestart:true,dialogFocus:true}));win.destroy();app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
