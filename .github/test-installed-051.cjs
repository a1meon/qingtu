const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-ci-'));
 const child=spawn(process.env.QT_TEST_EXE,['--user-data-dir='+profile,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{stdio:'ignore',detached:true});child.unref();
 let tab;for(let i=0;i<120&&!tab;i++){await delay(250);const port=await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
  if(port)tab=(await(await fetch('http://127.0.0.1:'+port.split(/\r?\n/)[0]+'/json/list')).json()).find(t=>t.url.startsWith('file:'));}
 assert(tab,'Could not locate installed application window');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
 let nextId=0;
 const call=expression=>new Promise((ok,no)=>{const id=++nextId;const timeout=setTimeout(()=>no(Error('Timed out running app action')),600000);
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id===id){clearTimeout(timeout);if(m.error||m.result.exceptionDetails)no(Error('Application update action failed: '+JSON.stringify(m.result?.exceptionDetails||m.error)));else ok(m.result.result.value);}};
  ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
 try{
  const available=await call("(async()=>{for(let i=0;i<160&&!document.querySelector('.version-button');i++)await new Promise(r=>setTimeout(r,80));return window.qingtu.checkUpdate()})()");
  assert.equal(available.version,'0.5.0');assert.equal(available.availableVersion,'0.5.1');
  await call('window.qingtu.downloadUpdate()');const ready=await call('window.qingtu.updateStatus()');
  assert.equal(ready.phase,'ready');assert.equal(ready.transferMode,'delta');assert.equal(ready.transferBytes,13374313);
  console.log('Verified 0.5.0 downloaded '+ready.transferBytes+' bytes for 0.5.1.');
  await call("setTimeout(()=>window.qingtu.installUpdate(),150); true");
 }finally{ws.close();}
})().catch(e=>{console.error(e);process.exit(1);});
