const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

// Minimal Electron stand-in: one toy window and a movable cursor.
function load(){
 const state={cursor:{x:0,y:0},windows:[]};
 class BrowserWindow{
  constructor(options){this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};this.sent=[];this.handlers={};state.windows.push(this);
   this.webContents={send:(channel)=>this.sent.push(channel),setWindowOpenHandler(){},on(){}};}
  setIgnoreMouseEvents(){} setOpacity(){} on(name,fn){this.handlers[name]=fn;} showInactive(){}
  async loadFile(){} isDestroyed(){return false;} destroy(){}
  getBounds(){return {...this.bounds};} getPosition(){return [this.bounds.x,this.bounds.y];}
  setPosition(x,y){this.bounds.x=x;this.bounds.y=y;}
 }
 const display={workArea:{x:0,y:0,width:1920,height:1080},bounds:{x:0,y:0,width:1920,height:1080}};
 const electron={BrowserWindow,screen:{getCursorScreenPoint:()=>({...state.cursor}),getDisplayMatching:()=>display,getPrimaryDisplay:()=>display,getAllDisplays:()=>[display]}};
 const original=Module._load;
 Module._load=function(request,...rest){return request==='electron'?electron:original.call(this,request,...rest);};
 delete require.cache[require.resolve('../desktop/toy-window.cjs')];
 const {createToyWindow}=require('../desktop/toy-window.cjs');
 Module._load=original;
 return {state,createToyWindow};
}

test('a toy drag only starts and continues while the cursor is on the toy',async()=>{
 const {state,createToyWindow}=load();
 const toy=createToyWindow({index:__filename,owner:()=>null,notify(){}});
 const catalog=require('../desktop/toy-catalog.json');
 await toy.set({enabled:true,kind:catalog[0].id});
 const win=state.windows[0],start=win.getBounds();
 toy.setInteractive(true);
 // A press far away (another app's widget) never moves the toy.
 state.cursor={x:start.x-600,y:start.y-400};
 toy.drag('start');toy.drag('move');
 assert.deepEqual(win.getBounds(),start);
 assert.ok(win.sent.includes('qingtu:toy-drag-cancel'));
 // A press on the toy drags it by the cursor's movement.
 state.cursor={x:start.x+150,y:start.y+110};
 toy.drag('start');
 state.cursor={x:start.x+190,y:start.y+80};
 toy.drag('move');
 assert.deepEqual([win.getBounds().x,win.getBounds().y],[start.x+40,start.y-30]);
 // If the cursor jumps far from the toy mid-drag (a stale capture), the drag ends.
 const before=win.getBounds();
 state.cursor={x:before.x+1200,y:before.y+600};
 toy.drag('move');
 assert.deepEqual(win.getBounds(),before);
 state.cursor={x:before.x+150,y:before.y+110};
 toy.drag('move');
 assert.deepEqual(win.getBounds(),before,'a cancelled drag does not resume');
 // While the window ignores the mouse, no drag can start at all.
 toy.setInteractive(false);
 toy.drag('start');state.cursor={x:before.x+170,y:before.y+120};toy.drag('move');
 assert.deepEqual(win.getBounds(),before);
});
