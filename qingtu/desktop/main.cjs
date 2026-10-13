const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net } = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');

async function start(options={}) {
  await app.whenReady();
  const {ImageService}=await import('../engine/service.mjs');
  const service=new ImageService();
  const root=path.join(__dirname,'../dist/client');
  const index=path.join(root,'index.html');
  let folder=options.testFolder||null,samplePromise,win;
  let activeOperations=0,startupChecked=false,chunkTransport;
  const {UpdateController}=require('./update-controller.cjs');
  const {resolveUpdateFeed}=require('./update-source.cjs');
  const nativeUpdater=options.updater||(process.platform==='darwin'?new (require('./mac-updater.cjs').MacUpdater)({version:app.getVersion(),arch:process.arch,publicKey:require('./sparkle-public-key.json').publicKey,cacheRoot:path.join(app.getPath('userData'),'update-parts'),fetcher:(url,request)=>net.fetch(url,request),native:require('./sparkle-native.cjs')}):require('electron-updater').autoUpdater);
  const updater=new UpdateController({version:app.getVersion(),updater:nativeUpdater,canInstall:()=>activeOperations===0,
    resolveFeed:options.resolveUpdateFeed||(async()=>{
      if(!app.isPackaged)return null;
      let source;
      try{source=JSON.parse(await fs.readFile(path.join(process.resourcesPath,'qingtu-update-source.json'),'utf8'));}
      catch(error){if(error.code!=='ENOENT')throw error;source=require('./update-source.json');}
      const feed=await resolveUpdateFeed(source,process.platform,process.arch,async url=>{
        const response=await net.fetch(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('发行版服务暂不可用');
        const text=await response.text();if(text.length>1024*1024)throw new Error('发行版信息过大');
        return JSON.parse(text);
      });
      if(feed&&source.provider==='gitee'&&process.platform==='win32'){
        const {ChunkTransport}=require('./chunk-download.cjs');const {GiteeChunkProvider}=require('./chunk-provider.cjs');
        chunkTransport ||= await new ChunkTransport(path.join(app.getPath('userData'),'update-parts'),{fetcher:(url,options)=>net.fetch(url,options)}).start();
        return {...feed,provider:'custom',updateProvider:GiteeChunkProvider,transport:chunkTransport};
      }
      return feed;
    })});
  updater.on('state',state=>{if(win&&!win.isDestroyed())win.webContents.send('qingtu:update',state);});
  const chooseFiles=async()=>{
    const paths=options.testFiles || (await dialog.showOpenDialog(win,{title:'添加图片',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['jpg','jpeg','png','webp','avif','tif','tiff']}]})).filePaths;
    const result={items:[],errors:[]};
    for(const p of paths || [])try{
      if((await fs.stat(p)).size>100*1024*1024)throw new Error('单张图片须小于 100 MB');
      result.items.push(await service.add(await fs.readFile(p),path.basename(p)));
    }catch(e){result.errors.push(path.basename(p)+'：'+e.message);}
    return result;
  };
  function createWindow(){
    win=new BrowserWindow({width:1280,height:820,minWidth:980,minHeight:700,...(process.platform==='darwin'?{frame:true,titleBarStyle:'hidden',trafficLightPosition:{x:14,y:18}}:{frame:false}),backgroundColor:'#f0faff',show:!options.hidden,title:'轻图',icon:path.join(__dirname,'../build/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.once('did-finish-load',()=>{
      if(!startupChecked){startupChecked=true;updater.check(false);}
    });
    win.loadFile(index);
    return win;
  }
  ipcMain.handle('qingtu:call',async(event,method,args=[])=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==pathToFileURL(index).href)throw new Error('无效窗口');
    if(!Array.isArray(args))throw new Error('无效参数');
    if(method==='samples') {
      if(samplePromise && !(await samplePromise).every(item=>service.files.has(item.id)))samplePromise=null;
      samplePromise ??= Promise.all(['alpine-lake','forest-cabin','coastline'].map(async name=>service.add(await fs.readFile(path.join(root,'samples',name+'.jpg')),name+'.jpg',true)));
      return samplePromise;
    }
    if(method==='chooseFiles')return chooseFiles();
    if(method==='importFiles') {
      const result={items:[],errors:[]};
      if(!Array.isArray(args[0])||args[0].length>100)throw new Error('一次最多添加 100 张图片');
      for(const f of args[0])try{result.items.push(await service.add(Buffer.from(f.base64,'base64'),f.name));}catch(e){result.errors.push(f.name+'：'+e.message);}
      return result;
    }
    if(['process','save'].includes(method)&&updater.status().phase==='installing')throw new Error('正在安装更新，请稍后再处理图片');
    if(method==='process'){activeOperations++;try{return await service.process(...args);}finally{activeOperations--;}}
    if(method==='updateStatus')return updater.status();
    if(method==='checkUpdate')return updater.check(true);
    if(method==='downloadUpdate')return updater.download();
    if(method==='installUpdate')return updater.install();
    if(method==='remove'){service.remove(args[0]);return true;}
    if(method==='chooseFolder'){
      if(options.testFolder)return {name:path.basename(options.testFolder),path:options.testFolder};
      const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'选择保存位置',defaultPath:folder||app.getPath('pictures'),properties:['openDirectory','createDirectory']});
      if(canceled)return null;
      folder=filePaths[0];return {name:path.basename(folder),path:folder};
    }
    if(method==='save'){
      if(!folder)throw new Error('请先选择保存位置');
      activeOperations++;try{return await service.save(args[0],folder);}finally{activeOperations--;}
    }
    if(method==='revealFolder'){if(folder)await shell.openPath(folder);return true;}
    if(method==='windowAction'){
      if(args[0]==='minimize')win.minimize();
      else if(args[0]==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}
      else if(args[0]==='close')win.close();
      return true;
    }
    throw new Error('不支持的操作');
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:'轻图',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),
    {label:'文件',submenu:[{label:'添加图片',accelerator:'CmdOrCtrl+O',click:()=>win.webContents.send('qingtu:menu','import')},{label:'导出图片',accelerator:'CmdOrCtrl+Shift+S',click:()=>win.webContents.send('qingtu:menu','export')}, {type:'separator'},process.platform==='darwin'?{role:'close'}:{role:'quit'}]},
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}
  ]));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0){service.files.clear();service.results.clear();service.totalBytes=0;samplePromise=null;folder=null;createWindow();}});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin'||options.hidden)app.quit();});
  app.on('will-quit',()=>{chunkTransport?.close();nativeUpdater.close?.();});
  return {win,service,updater};
}
module.exports={start};
if(require.main===module)start().catch(error=>{dialog.showErrorBox('轻图启动失败',error.message);app.quit();});
