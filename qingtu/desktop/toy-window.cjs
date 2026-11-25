const {BrowserWindow,screen}=require('electron');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const catalog=require('./toy-catalog.json');

const width=300,height=226;

function createToyWindow({index,owner,notify,hidden=false,offscreen=false}){
 const url=pathToFileURL(index);
 url.searchParams.set('view','toy');
 let window=null,kind=catalog[0].id,lastBounds,dragOrigin;
 const state=()=>({enabled:!!window,kind});
 function close(){
  const current=window;
  if(!current)return;
  window=null;
  dragOrigin=null;
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
   webPreferences:{preload:join(__dirname,'toy-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen}
  });
  window=child;
  if(hidden)child.setOpacity(0);
  else child.on('move',()=>{lastBounds=child.getBounds();});
  child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  child.webContents.on('will-navigate',event=>event.preventDefault());
  child.webContents.on('render-process-gone',()=>{if(window===child)close();});
  child.on('closed',()=>{
   if(window!==child)return;
   window=null;dragOrigin=null;notify(state());
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
 function drag(phase,x,y){
  if(phase==='end'){dragOrigin=null;return;}
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  if(phase==='start'){
   const [left,top]=window.getPosition();
   dragOrigin={x,y,left,top,lastX:left,lastY:top};
  }else if(phase==='move'&&dragOrigin){
   const nextX=Math.round(dragOrigin.left+x-dragOrigin.x),nextY=Math.round(dragOrigin.top+y-dragOrigin.y);
   if(nextX===dragOrigin.lastX&&nextY===dragOrigin.lastY)return;
   window.setPosition(nextX,nextY);
   dragOrigin.lastX=nextX;dragOrigin.lastY=nextY;
  }
 }
 function validSender(event){
  return window&&!window.isDestroyed()&&event.sender===window.webContents&&
   event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===url.href;
 }
 return {state,set,close,drag,validSender};
}

module.exports={createToyWindow};
