// Included only by the isolated two-version test build, never production.
const {app,net}=require('electron');const path=require('node:path');const fs=require('node:fs');const {MacUpdater}=require('./mac-updater.cjs');
(async()=>{await app.whenReady();const proof=process.env.QINGTU_FIXTURE_PROOF;const record=event=>{if(proof)fs.appendFileSync(proof,JSON.stringify(event)+'\n');};
 const native=require('./sparkle-native.cjs');const updater=new MacUpdater({version:app.getVersion(),arch:process.arch,publicKey:require('./sparkle-public-key.json').publicKey,cacheRoot:path.join(app.getPath('temp'),'qingtu-fixture-'+process.pid),fetcher:(u,o)=>net.fetch(u,o),native:{install:o=>native.install({...o,onEvent:event=>{record(event);o.onEvent(event);}})}});
 updater.on('update-available',()=>record({type:'available',version:app.getVersion()}));updater.on('update-downloaded',()=>record({type:'downloaded'}));
 const {win}=await require('./main.cjs').start({updater,resolveUpdateFeed:async()=>({url:process.env.QINGTU_FIXTURE_FEED})});win.setTitle('轻图更新验证');record({type:'launched',version:app.getVersion()});
})().catch(e=>{console.error(e);app.exit(1);});
