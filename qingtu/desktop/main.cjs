const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net } = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');

async function start(options={}) {
  await app.whenReady();
  const {ImageService}=await import('../engine/service.mjs');
  const service=new ImageService();
  const {ProjectStore}=await import('../engine/project-store.mjs');
  const {StitchService}=await import('../engine/stitch-service.mjs');
  const store=new ProjectStore(options.projectRoot||path.join(app.getPath('userData'),'stitch-projects'));
  const stitching=new StitchService(store,service);
  const root=path.join(__dirname,'../dist/client');
  const index=path.join(root,'index.html');
  const folders=new Map();
  const {loadExportFolders}=await import('../engine/export-folders.mjs');
  const lastFolders=await loadExportFolders(store.root);
  const scopeOf=value=>value==='stitch'?'stitch':'compression';
  const picturesFolder=app.getPath('pictures');
  const defaultFolder=path.join(picturesFolder,'轻图output');
  async function outputFolder(scope){
    if(options.testFolder)return options.testFolder;
    if(!folders.has(scope)){
      const previous=lastFolders.customFolder(scope,picturesFolder);
      const available=previous&&(await fs.stat(previous).catch(()=>null))?.isDirectory();
      // A choice made while checking the previous path takes precedence.
      if(!folders.has(scope))folders.set(scope,available?previous:defaultFolder);
    }
    return folders.get(scope);
  }
  const describeFolder=folder=>({name:path.basename(folder),path:folder});
  let samplePromise,win;
  let activeOperations=0,startupChecked=false,chunkTransport,closeApproved=false,closePending=false,quitRequested=false,rendererReady=false;
  app.on('before-quit',()=>{quitRequested=true;});
  const flushRequests=new Map();
  const validSender=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(index).href;
  function flushRenderer(){
    return new Promise((resolve,reject)=>{
      const id=require('node:crypto').randomUUID();
      flushRequests.set(id,{resolve,reject});if(rendererReady)win.webContents.send('qingtu:flush',id);
    });
  }
  ipcMain.handle('qingtu:flushed',(event,id,error)=>{if(!validSender(event))throw new Error('无效窗口');const request=flushRequests.get(id);if(!request)return;flushRequests.delete(id);if(error)request.reject(new Error(String(error)));else request.resolve();});
  ipcMain.handle('qingtu:flushReady',event=>{if(!validSender(event))throw new Error('无效窗口');rendererReady=true;for(const id of flushRequests.keys())win.webContents.send('qingtu:flush',id);});
  const {UpdateController}=require('./update-controller.cjs');
  const {resolveUpdateFeed}=require('./update-source.cjs');
  const nativeUpdater=options.updater||(process.platform==='darwin'?new (require('./mac-updater.cjs').MacUpdater)({version:app.getVersion(),arch:process.arch,publicKey:require('./sparkle-public-key.json').publicKey,cacheRoot:path.join(app.getPath('userData'),'update-parts'),baseFiles:[path.join(app.getPath('downloads'),`Qingtu-${app.getVersion()}-mac-${process.arch}.zip`),path.join(app.getPath('home'),'Downloads',`Qingtu-${app.getVersion()}-${process.arch}`,`Qingtu-${app.getVersion()}-mac-${process.arch}.zip`)],fetcher:(url,request)=>net.fetch(url,request),native:require('./sparkle-native.cjs')}):require('electron-updater').autoUpdater);
  const updater=new UpdateController({development:!app.isPackaged&&!options.resolveUpdateFeed,version:app.isPackaged?app.getVersion():require('../package.json').version,updater:nativeUpdater,canInstall:()=>activeOperations===0,
    resolveFeed:options.resolveUpdateFeed||(async()=>{
      let source;
      try{source=JSON.parse(await fs.readFile(path.join(process.resourcesPath,'qingtu-update-source.json'),'utf8'));}
      catch(error){if(error.code!=='ENOENT')throw error;source=require('./update-source.json');}
      const feed=await resolveUpdateFeed(source,process.platform,process.arch,async url=>{
        const response=await net.fetch(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('发行版服务暂不可用');
        const text=await response.text();if(text.length>1024*1024)throw new Error('发行版信息过大');
        return JSON.parse(text);
      });
      if(feed&&['gitee','cnb'].includes(source.provider)&&process.platform==='win32'){
        const {ChunkTransport}=require('./chunk-download.cjs');const {GiteeChunkProvider}=require('./chunk-provider.cjs');
        chunkTransport ||= await new ChunkTransport(path.join(app.getPath('userData'),'update-parts'),{fetcher:(url,options)=>net.fetch(url,options),baseFiles:[
          path.join(app.getPath('downloads'),`Qingtu-${app.getVersion()}-win-${process.arch}.exe`),
          path.join(nativeUpdater.app.baseCachePath,'qingtu-updater','installer.exe'),
          path.join(app.getPath('temp'),`Qingtu-${app.getVersion()}-install`,`Qingtu-${app.getVersion()}-win-${process.arch}.exe`),
        ]}).start();
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
    rendererReady=false;
    win=new BrowserWindow({width:1280,height:820,minWidth:980,minHeight:700,...(process.platform==='darwin'?{frame:true,titleBarStyle:'hidden',trafficLightPosition:{x:14,y:18}}:{frame:false}),backgroundColor:'#f0faff',show:!options.hidden,title:'轻图',icon:path.join(__dirname,'../build/icon.png'),webPreferences:{offscreen:options.offscreen===true,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    // The renderer's dirty-state effect can lag a committed save by one frame.
    // Only bypass beforeunload after the trusted flush protocol has completed.
    win.webContents.on('will-prevent-unload',event=>{if(closeApproved)event.preventDefault();});
    win.webContents.on('render-process-gone',()=>{for(const request of flushRequests.values())request.reject(new Error('界面进程已退出；已保存的项目可在重启后恢复'));flushRequests.clear();});
    win.on('close',event=>{
      if(closeApproved)return;event.preventDefault();if(closePending)return;closePending=true;
      options.onCloseTrace?.('waiting renderer');
      flushRenderer().then(async()=>{options.onCloseTrace?.('renderer flushed');await store.flush();await stitching.flush().catch(()=>{});await Promise.all([...service.files.values()].map(file=>file.pending?.catch(()=>{})));closeApproved=true;options.onCloseTrace?.('closing');win.close();})
        .catch(error=>{quitRequested=false;if(options.onCloseError)options.onCloseError(error);else dialog.showErrorBox('项目尚未保存',error.message);}).finally(()=>{closePending=false;});
    });
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.once('did-finish-load',()=>{
      if(!startupChecked){startupChecked=true;updater.check(false);}
    });
    win.loadFile(index);
    return win;
  }
  ipcMain.handle('qingtu:call',async(event,method,args=[])=>{
    if(!validSender(event))throw new Error('无效窗口');
    if(!Array.isArray(args))throw new Error('无效参数');
    const stitchMethods=['stitchList','stitchLoad','stitchSave','stitchDelete','stitchImport','stitchChooseFiles','stitchPreviews','stitchMissing','stitchRender','stitchRelease'];
    if(stitchMethods.includes(method)){
      if(updater.status().phase==='installing')throw new Error('正在安装更新，请稍后再操作');
      activeOperations++;
      try{
        if(method==='stitchList')return await store.list();
        if(method==='stitchLoad')return await store.load(args[0]);
        if(method==='stitchSave')return await store.save(args[0]);
        if(method==='stitchDelete'){stitching.release(args[0]);return await store.remove(args[0],args[1]);}
        if(method==='stitchImport'){const f=args[0];if(!f||typeof f.base64!=='string'||f.base64.length>140*1024*1024)throw new Error('图片数据无效');return await store.import(Buffer.from(f.base64,'base64'),f.name,{reference:args[1]===true});}
        if(method==='stitchChooseFiles'){
          const paths=options.testFiles||(await dialog.showOpenDialog(win,{title:args[0]==='open'?'打开图片':'添加图片',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['jpg','jpeg','png','webp','avif','tif','tiff']}]})).filePaths;
          const result={items:[],errors:[]};for(const p of paths||[])try{if((await fs.stat(p)).size>100*1024*1024)throw new Error('单张图片须小于 100 MB');result.items.push(await store.import(await fs.readFile(p),path.basename(p)));}catch(e){result.errors.push(path.basename(p)+'：'+e.message);}return result;
        }
        if(method==='stitchPreviews'){if(!Array.isArray(args[0])||args[0].length>100)throw new Error('图片参数无效');const out=[];for(const id of args[0])out.push(await store.preview(id));return out;}
        if(method==='stitchMissing'){if(!Array.isArray(args[0])||args[0].length>100)throw new Error('图片参数无效');const out=[];for(const id of args[0])try{await fs.access(store.assetFile(id));}catch(error){if(error.code!=='ENOENT')throw error;out.push(id);}return out;}
        if(method==='stitchRender')return await stitching.render(...args);
        if(method==='stitchRelease'){stitching.release(args[0]);return true;}
      }finally{activeOperations--;}
    }
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
    if(method==='installUpdate'){if(activeOperations)throw new Error('请等待处理和保存完成');await flushRenderer();await store.flush();return updater.install();}
    if(method==='rename')return service.rename(...args);
    if(method==='remove'){service.remove(args[0]);return true;}
    if(method==='chooseFolder'){
      const scope=scopeOf(args[0]),current=await outputFolder(scope);
      if(options.testFolder)return describeFolder(current);
      const exists=(await fs.stat(current).catch(()=>null))?.isDirectory();
      const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'选择保存位置',defaultPath:exists?current:picturesFolder,properties:['openDirectory','createDirectory']});
      if(canceled)return null;
      const folder=filePaths[0];folders.set(scope,folder);return describeFolder(folder);
    }
    if(method==='save'){
      const scope=scopeOf(args[1]);
      activeOperations++;
      try{
        const folder=await outputFolder(scope);
        const usedDefault=path.relative(defaultFolder,folder)==='';
        const result=await service.save(args[0],folder,{createFolder:usedDefault});
        await lastFolders.record(scope,result.path,usedDefault);
        return {...result,folder};
      }finally{activeOperations--;}
    }
    if(method==='outputFolder')return describeFolder(await outputFolder(scopeOf(args[0])));
    if(method==='exportThumbnail')return lastFolders.thumbnail(scopeOf(args[0]),args[1]);
    if(method==='exportHistory')return lastFolders.list(scopeOf(args[0]),args[1]);
    if(method==='revealFolder'){
      const scope=scopeOf(args[0]);
      const folder=args.length>1?await lastFolders.folderFor(scope,args[1]):lastFolders.get(scope);
      if(!folder)throw new Error('此模块还没有成功导出过图片');
      const info=await fs.stat(folder).catch(()=>null);
      if(!info?.isDirectory())throw new Error('无法访问上次输出的文件夹，请检查目录是否已移动或删除');
      const error=await shell.openPath(folder);
      if(error)throw new Error('无法打开输出文件夹：'+error);
      return true;
    }
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
    {label:'编辑',submenu:[{label:'撤销',accelerator:'CmdOrCtrl+Z',click:()=>win.webContents.send('qingtu:menu','undo')},{label:'重做',accelerator:'CmdOrCtrl+Shift+Z',click:()=>win.webContents.send('qingtu:menu','redo')},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}
  ]));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0){service.files.clear();service.results.clear();service.totalBytes=0;samplePromise=null;folders.clear();closeApproved=false;createWindow();}});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin'||options.hidden||quitRequested)app.quit();});
  app.on('will-quit',()=>{chunkTransport?.close();nativeUpdater.close?.();});
  return {win,service,updater,store,stitching};
}
module.exports={start};
if (require.main === module) {
  const startup = process.platform === 'win32'
    ? require('./windows-launch.cjs').launchWindows(app, start)
    : start();
  startup.catch(error => { dialog.showErrorBox('轻图启动失败', error.message); app.quit(); });
}
