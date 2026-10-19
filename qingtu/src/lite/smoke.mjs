export async function smoke(ctx){
 const {api,native,call,N}=ctx;const report={};
 try{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<50&&!document.querySelector('.titlebar');i++)await wait(100);
  await N.window.move(32000,32000);report.hidden=!(await N.window.isVisible());report.position=await N.window.getPosition();if(!report.hidden)throw new Error('Test window visible');
  report.ui=!!document.querySelector('.titlebar');if(!report.ui)throw new Error('UI did not mount');
  report.stage='list';report.worker=await call('stitchList');
  const input=await native('readFile',globalThis.NL_PATH+'/fixture.png');
  report.stage='import';const image=await api.stitchImport({name:'输入.png',base64:input});delete image.preview;
  const project={id:'lite-smoke',name:'轻量导出测试',images:[image],canvasMode:'fixed',canvas:{width:64,height:48},positions:{[image.id]:{x:2,y:3,width:40,height:30}},layout:'horizontal',export:{format:'png',targetBytes:1000000}};
  report.stage='save';await api.stitchSave(project);report.project=await api.stitchLoad(project.id);
  report.stage='render';const rendered=await api.stitchRender(project);report.export={width:rendered.width,height:rendered.height,bytes:rendered.bytes,format:rendered.format};
  if(rendered.width!==64||rendered.height!==48||!rendered.bytes)throw new Error('Export invalid');
  const exportRoot=globalThis.NL_PATH+'/smoke-exports';await native('mkdir',exportRoot);report.saved=await call('save',rendered.token,exportRoot);const second=await api.stitchRender(project);report.savedAgain=await call('save',second.token,exportRoot);if(report.saved.path===report.savedAgain.path)throw new Error('Export overwrote same-name file');
  const compression=await api.importFiles([{name:'原图.png',base64:input}]);
  const item=compression.items[0];if(!item)throw new Error(compression.errors.join());
  const compressed=await api.process(item.id,{mode:'smart',format:'jpeg',targetBytes:1000000,resize:{type:'scale',percent:50}});report.compression={width:compressed.width,height:compressed.height,bytes:compressed.bytes};
  await ctx.flush();report.ok=true;
 }catch(e){report.error={message:e.message,stack:e.stack,code:e.code};}
 await N.filesystem.writeFile(globalThis.NL_PATH+'/smoke-report.json',JSON.stringify(report));await N.app.exit(report.ok?0:1);
}
