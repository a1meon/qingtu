// Entirely hidden Chromium fixture: real shipped Neutralino client, CSP,
// parser-blocking globals and WebSocket, with an intentionally delayed server.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
app.setActivationPolicy('accessory');
app.on('window-all-closed',()=>{});
app.commandLine.appendSwitch('disable-gpu');
const root=path.resolve('artifacts/lite-startup');
app.setPath('userData',path.join(root,'profile'));
(async()=>{
 await fs.mkdir(root,{recursive:true});await app.whenReady();
 const sdk=await fs.readFile('node_modules/@neutralinojs/lib/dist/neutralino.mjs'),startup=await fs.readFile('src/lite/startup.mjs'),failure=await fs.readFile('src/lite/startup-error.mjs');
 let globalsRequests=0,connections=0,tokenIssued=false,denySocket=false;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/__neutralino_globals.js') {
   globalsRequests++;
   // Simulate a slow first-run machine without any native injected globals.
   await new Promise(r=>setTimeout(r,180));res.setHeader('Content-Type','application/javascript');
   res.end(`var NL_PORT=${server.address().port};var NL_TOKEN='${tokenIssued?'':'access.connect'}';var NL_OS='Windows';var NL_PATH='C:/Users/测试/轻图';var NL_ARGS=[];`);tokenIssued=true;return;
  }
  if(['/sdk.mjs','/startup.mjs','/failure.mjs'].includes(url.pathname)) {res.setHeader('Content-Type','application/javascript');res.end(url.pathname==='/sdk.mjs'?sdk:url.pathname==='/startup.mjs'?startup:failure);return;}
  if(url.pathname==='/entry.mjs') {res.setHeader('Content-Type','application/javascript');res.end(`import * as N from '/sdk.mjs';import {startNativeClient} from '/startup.mjs';import {showStartupFailure} from '/failure.mjs';try {${url.searchParams.has('legacy')?'N.init();':"await startNativeClient(N,globalThis,{timeoutMs:500});"}document.title='ready';}catch(e){window.rootWasMissing=!document.getElementById('root');showStartupFailure(e);document.title='failed';}`);return;}
  const legacy=url.searchParams.has('legacy');res.setHeader('Content-Type','text/html');
  res.end(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' ws:; object-src 'none'; base-uri 'self'"><title>loading</title>${legacy?'':'<script src="/__neutralino_globals.js"></script>'}<div id="root"></div><script type="module" src="/entry.mjs${legacy?'?legacy':''}"></script>`);
 });
 const sockets=new Set();server.on('upgrade',(req,socket)=>{assert.equal(req.url,'/?connectToken=connect');if(denySocket){socket.destroy();return;}connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const cases=[];
 try {
  for(const mode of ['legacy','fixed','rejected']) {
   const legacy=mode==='legacy';tokenIssued=false;denySocket=mode==='rejected';
   const win=new BrowserWindow({show:false,x:32000,y:32000,width:800,height:600,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true}});
   assert.ok(!win.isVisible()&&!win.isFocused()&&win.webContents.isOffscreen());
   await win.loadURL(origin+(legacy?'/?legacy':'/'));
   let state;
   async function read(){for(let n=0;n<80;n++){state=await win.webContents.executeJavaScript('({title:document.title,error:document.getElementById("root")?.textContent,rootWasMissing:window.rootWasMissing,recovery:!!document.querySelector("a[href*=halframe-releases]")})');if(state.title!=='loading')return;await new Promise(r=>setTimeout(r,50));}}
   await read();
   if(legacy){assert.equal(state.title,'failed');assert.match(state.error,/WebSocket/);assert.match(state.error,/undefined/);}
   else if(mode==='fixed') {
    assert.equal(state.title,'ready',JSON.stringify(state));assert.equal(globalsRequests,1);assert.equal(connections,1);
    await win.loadURL(origin+'/');await read();assert.equal(state.title,'ready',JSON.stringify(state));assert.equal(globalsRequests,2);assert.equal(connections,2);
    assert.equal(await win.webContents.executeJavaScript('NL_TOKEN'),'','refresh uses cached one-time token');
   } else {assert.equal(state.title,'failed');assert.equal(state.rootWasMissing,true,'real SDK removed root on socket error');assert.match(state.error,/连接超时/);assert.equal(state.recovery,true);}
   cases.push({mode,...state,hidden:true,offscreen:true});win.destroy();
  }
  const html=await fs.readFile('dist/lite/index.html','utf8');assert.ok(html.indexOf('/__neutralino_globals.js')<html.indexOf('type="module"'));
  assert.equal(globalsRequests,3);assert.equal(connections,2);
  const report={passed:true,originalErrorReproduced:true,realNeutralinoClient:true,cspEnabled:true,delayedGlobals:true,refreshWithOneTimeToken:true,rejectedSocketRecovery:true,globalsRequests,connections,cases,windowsNativeRuntimeExecuted:false};
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{for(const socket of sockets)socket.destroy();server.close();}
 app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
