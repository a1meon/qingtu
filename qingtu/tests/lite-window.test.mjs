import test from 'node:test';import assert from 'node:assert/strict';
import {windowOptions,fittedNativeWindow,fitInitialWindow,bindTitlebar,setupNativeMenu} from '../src/lite/window-shell.mjs';
test('both lightweight platforms remove the duplicate native title row with physical API units',()=>{
 const win=windowOptions('win32'),mac=windowOptions('darwin');
 assert.equal(win.borderless,true);assert.equal(win.resizable,true);assert.equal(win.useLogicalPixels,false,'never mix scaled widths with native physical screen coordinates');
 assert.equal(mac.borderless,true);assert.equal(mac.resizable,true);assert.equal(mac.useLogicalPixels,false,'Cocoa frame sizes are already points');
 assert.equal(win.injectGlobals,false);assert.equal(mac.injectGlobals,false);
});
test('native frame and position fit physical work area at 100/125/150/200 percent DPI and on offset monitors',()=>{
 for(const dpi of [96,120,144,192])for(const left of [-1920,0,1920]){
  const workArea={left,top:40,right:left+1920,bottom:1040},b=fittedNativeWindow({workArea,dpi});
  assert.ok(b.x>=workArea.left&&b.y>=workArea.top);assert.ok(b.x+b.width<=workArea.right&&b.y+b.height<=workArea.bottom);
  assert.equal(b.x,left+Math.floor((1920-b.width)/2));assert.ok(b.minWidth<=b.width&&b.minHeight<=b.height);assert.equal(b.minWidth,600*dpi/96);
 }
 assert.deepEqual(fittedNativeWindow({workArea:{left:0,top:0,right:1920,bottom:1040},dpi:192}),{width:1856,height:976,minWidth:1200,minHeight:840,resizable:true,x:32,y:32});
 const tiny=fittedNativeWindow({workArea:{left:0,top:0,right:500,bottom:400},dpi:192});assert.ok(tiny.minWidth<=tiny.width&&tiny.minHeight<=tiny.height);
 assert.throws(()=>fittedNativeWindow({dpi:0}),/工作区/);
});
test('hidden fixtures never enter physical displays; Windows fit uses native metrics and explicit physical position',async()=>{
 const calls=[],N={window:{setSize:async s=>calls.push(['size',s]),move:async(x,y)=>calls.push(['move',x,y]),center:()=>{throw Error('Native center uses inconsistent units');}}};
 const native=async(method,pid)=>{assert.equal(method,'windowMetrics');assert.equal(pid,123);return {workArea:{left:0,top:0,right:1920,bottom:1040},dpi:192};};
 await fitInitialWindow(N,'win32',{native,pid:123,args:['--window-hidden=true']});assert.deepEqual(calls,[]);
 await fitInitialWindow(N,'darwin',{args:[]});assert.deepEqual(calls,[],'Cocoa native resize style remains untouched');
 await fitInitialWindow(N,'win32',{native,pid:123,args:[]});assert.deepEqual(calls.map(c=>c[0]),['size','move']);assert.equal(calls[0][1].width,1856);assert.deepEqual(calls[1],['move',32,32]);
});
test('Windows creates no native menu, including no empty HMENU strip; Mac retains standard application shortcuts',async()=>{
 const calls=[],N={window:{setMainMenu:async menu=>calls.push(menu)}};
 await setupNativeMenu(N,'win32');assert.deepEqual(calls,[]);
 await setupNativeMenu(N,'darwin');assert.equal(calls.length,1);assert.equal(calls[0][1].menuItems[0].shortcut,'o');assert.equal(calls[0][0].menuItems[0].id,'quit');
});
test('both toolbars bind after mount, exclude dialog descendants and restore drag listeners on cleanup',async()=>{
 const calls=[],listeners=new Map(),buttons=[{}],element={querySelectorAll:()=>buttons,addEventListener:(name,f)=>listeners.set(name,f),removeEventListener:name=>listeners.delete(name)};
 const N={window:{setDraggableRegion:async(e,options)=>calls.push({e,options}),unsetDraggableRegion:async e=>calls.push({unset:e})}};
 const unbind=await bindTitlebar(N,element,'darwin');assert.equal(calls[0].e,element);assert.deepEqual(calls[0].options.exclude,buttons);assert.equal(listeners.has('dblclick'),true);unbind();assert.equal(listeners.has('dblclick'),false);assert.equal(calls[1].unset,element);
 const count=calls.length;const cleanup=await bindTitlebar(N,element,'win32');assert.equal(calls.length,count+1);cleanup();
});
test('Mac titlebar excludes stable update dialog with buttons added after binding',async()=>{
 const button={},dialog={},listeners=new Map();let excluded;
 const element={querySelectorAll:selector=>selector.includes('dialog')?[button,dialog]:[button],addEventListener:(name,f)=>listeners.set(name,f),removeEventListener:name=>listeners.delete(name)};
 const N={window:{setDraggableRegion:async(e,options)=>{excluded=options.exclude;},unsetDraggableRegion:async()=>{},isMaximized:()=>{throw new Error('Dialog must not maximize the window');}}};
 const unbind=await bindTitlebar(N,element,'darwin');assert.ok(excluded.includes(dialog),'new dialog descendants must remain excluded from native dragging');
 listeners.get('dblclick')({target:{closest:selector=>selector.includes('dialog')?dialog:null}});unbind();
});
