const {BrowserWindow,screen}=require('electron');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const catalog=require('./toy-catalog.json');

const width=300,height=226;
const isNativeCoordinate=value=>value>=-0x80000000&&value<=0x7fffffff;

function createToyWindow({index,owner,notify,hidden=false,offscreen=false}){
 const url=pathToFileURL(index);
 url.searchParams.set('view','toy');
 let window=null,kind=catalog[0].id,lastBounds,dragOrigin,interactive=false;
 const state=()=>({enabled:!!window,kind});
 function close(){
  const current=window;
  if(!current)return;
  window=null;
  dragOrigin=null;interactive=false;
  current.destroy();
  notify(state());
 }
 function position(){
  if(hidden){
   const displays=screen.getAllDisplays();
   return {x:Math.max(...displays.map(({bounds})=>bounds.x+bounds.width))+256,
    y:Math.max(...displays.map(({bounds})=>bounds.y+bounds.height))+256};
  }
  const relativeTo=lastBounds||owner()?.getBounds();
  const {workArea}=relativeTo?screen.getDisplayMatching(relativeTo):screen.getPrimaryDisplay();
  const right=workArea.x+workArea.width-width,bottom=workArea.y+workArea.height-height;
  return {x:Math.max(workArea.x,Math.min(right,lastBounds?.x??right-24)),
   y:Math.max(workArea.y,Math.min(bottom,lastBounds?.y??bottom-24))};
 }
 async function set(next){
  if(typeof next?.enabled!=='boolean'||!catalog.some(item=>item.id===next.kind))throw new Error('玩具设置无效');
  kind=next.kind;
  dragOrigin=null;
  if(!next.enabled){close();return state();}
  if(window){
   window.webContents.send('qingtu:toy-kind',kind);
   notify(state());
   return state();
  }
  const child=new BrowserWindow({
   ...position(),width,height,show:false,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,
   resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,hasShadow:false,title:'摸鱼玩具',
   // The toy opens inactive; the first click must play it, not just focus the window (macOS).
   acceptFirstMouse:true,
   webPreferences:{preload:join(__dirname,'toy-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen}
  });
  window=child;
  // Transparent areas must not catch clicks meant for windows underneath
  // (other desktop pets, the desktop itself). The renderer turns input back
  // on only while the pointer is over the toy artwork.
  child.setIgnoreMouseEvents(true,{forward:true});
  if(hidden)child.setOpacity(0);
  else child.on('move',()=>{lastBounds=child.getBounds();});
  child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  child.webContents.on('will-navigate',event=>event.preventDefault());
  child.webContents.on('render-process-gone',()=>{if(window===child)close();});
  child.on('closed',()=>{
   if(window!==child)return;
   window=null;dragOrigin=null;interactive=false;notify(state());
  });
  try{
   await child.loadFile(index,{query:{view:'toy'}});
   if(window===child){
    if(!hidden)child.showInactive();
    notify(state());
   }
   return state();
  }catch(error){
   if(window!==child)return state();
   close();
   throw error;
  }
 }
 // Drags follow the real cursor (main-process DIPs, so mixed-DPI Windows
 // displays agree) and are only honoured while the cursor is on the toy. A
 // toy drag always keeps the cursor over the window, so a press that started
 // elsewhere (another app's widget, a stale capture after a lost mouse-up)
 // can never move it.
 const DRAG_SLACK=96;
 function cursorNear(slack){
  const cursor=screen.getCursorScreenPoint(),b=window.getBounds();
  return cursor.x>=b.x-slack&&cursor.x<=b.x+b.width+slack&&cursor.y>=b.y-slack&&cursor.y<=b.y+b.height+slack?cursor:null;
 }
 function cancelDrag(){
  dragOrigin=null;
  if(window&&!window.isDestroyed())window.webContents.send('qingtu:toy-drag-cancel');
 }
 function drag(phase){
  if(phase==='end'){dragOrigin=null;return;}
  if(!window||window.isDestroyed())return;
  if(phase==='start'){
   // A drag can only begin while the window accepts input over the toy and
   // the cursor is actually on it.
   const cursor=interactive&&cursorNear(12);
   if(!cursor){cancelDrag();return;}
   const [left,top]=window.getPosition();
   dragOrigin={x:cursor.x,y:cursor.y,left,top,lastX:left,lastY:top};
  }else if(phase==='move'&&dragOrigin){
   const cursor=cursorNear(DRAG_SLACK);
   if(!cursor){cancelDrag();return;}
   // Electron's int32 converter rejects JavaScript's negative zero.
   const nextX=Math.round(dragOrigin.left+(cursor.x-dragOrigin.x))+0;
   const nextY=Math.round(dragOrigin.top+(cursor.y-dragOrigin.y))+0;
   if(!isNativeCoordinate(nextX)||!isNativeCoordinate(nextY))return;
   if(nextX===dragOrigin.lastX&&nextY===dragOrigin.lastY)return;
   try{window.setPosition(nextX,nextY);}
   catch(error){dragOrigin=null;console.warn('桌面玩具移动失败',error.message);return;}
   dragOrigin.lastX=nextX;dragOrigin.lastY=nextY;
  }
 }
 function setInteractive(value){
  if(!window||window.isDestroyed())return;
  const next=!!value;
  if(next===interactive)return;
  interactive=next;
  if(!next)dragOrigin=null;
  window.setIgnoreMouseEvents(!next,{forward:true});
 }
 function validSender(event){
  return window&&!window.isDestroyed()&&event.sender===window.webContents&&
   event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===url.href;
 }
 return {state,set,close,drag,setInteractive,validSender};
}

module.exports={createToyWindow};
