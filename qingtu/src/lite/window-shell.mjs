export function windowOptions(platform) {
 return {title:'轻图',width:1280,height:820,minWidth:600,minHeight:420,
  resizable:true,useLogicalPixels:false,borderless:true,
  transparent:platform==='darwin',
  hidden:false,center:true,exitProcessOnClose:false,useSavedState:false,
  injectGlobals:false,injectClientLibrary:false,icon:'/resources/assets/app-icon.png'};
}

export function fittedNativeWindow({workArea,dpi}) {
 if(!workArea||![workArea.left,workArea.top,workArea.right,workArea.bottom,dpi].every(Number.isFinite)||dpi<=0||workArea.right<=workArea.left||workArea.bottom<=workArea.top)throw new Error('屏幕工作区无效');
 const scale=dpi/96,workWidth=workArea.right-workArea.left,workHeight=workArea.bottom-workArea.top;
 const width=Math.min(Math.round(1280*scale),Math.max(1,workWidth-Math.round(32*scale))),height=Math.min(Math.round(820*scale),Math.max(1,workHeight-Math.round(32*scale)));
 return {width,height,minWidth:Math.min(width,Math.round(600*scale)),minHeight:Math.min(height,Math.round(420*scale)),resizable:true,x:workArea.left+Math.floor((workWidth-width)/2),y:workArea.top+Math.floor((workHeight-height)/2)};
}

export async function fitInitialWindow(N,platform,{native,pid=globalThis.NL_PID,args=globalThis.NL_ARGS||[]}={}) {
 // Hidden validation windows must never be centred into a physical display.
 if(platform!=='win32'||args.includes('--qingtu-smoke')||args.includes('--window-hidden=true'))return;
 // Use Win32 work area and per-window DPI. Neutralino's logical-pixel centre
 // mixes physical desktop coordinates with scaled window dimensions.
 const {x,y,...size}=fittedNativeWindow(await native('windowMetrics',pid));
 await N.window.setSize(size);
 await N.window.move(x,y);
}

export async function bindTitlebar(N,element,platform,toggleMaximize) {
 if(!['darwin','win32'].includes(platform)||!element)return()=>{};
 await N.window.setDraggableRegion(element,{exclude:[...element.querySelectorAll('button,dialog')]});
 const doubleClick=event=>{if(event.target.closest('button,a,input,dialog'))return;(toggleMaximize?toggleMaximize():N.window.isMaximized().then(maximized=>maximized?N.window.unmaximize():N.window.maximize())).catch(console.error);};
 element.addEventListener('dblclick',doubleClick);
 return()=>{element.removeEventListener('dblclick',doubleClick);N.window.unsetDraggableRegion(element).catch(()=>{});};
}

export async function setupNativeMenu(N,platform) {
 // Even an empty Win32 HMENU can add a blank menu strip. Create none on Windows.
 if(platform!=='darwin')return;
 await N.window.setMainMenu([{text:'轻图',menuItems:[{id:'quit',text:'退出轻图',shortcut:'q'}]},
  {text:'文件',menuItems:[{id:'import',text:'添加图片',shortcut:'o'},{id:'export',text:'导出图片',shortcut:'S'},{id:'close',text:'关闭',shortcut:'w'}]},
  {text:'编辑',menuItems:[{text:'撤销',action:'undo:',shortcut:'z'},{text:'重做',action:'redo:',shortcut:'Z'},{text:'剪切',action:'cut:',shortcut:'x'},{text:'复制',action:'copy:',shortcut:'c'},{text:'粘贴',action:'paste:',shortcut:'v'},{text:'全选',action:'selectAll:',shortcut:'a'}]}]);
}
