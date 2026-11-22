// Browsers expose the requested download name, but not its final path on disk.
let opening;
function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open('qingtu-download-history',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('downloads',{keyPath:'id',autoIncrement:true}).createIndex('scope','scope');
  request.onerror=()=>{opening=null;reject(request.error);};
  request.onsuccess=()=>resolve(request.result);
 });
 return opening;
}
export async function lastBrowserFolder(scope){
 const index=(await database()).transaction('downloads').objectStore('downloads').index('scope');
 return new Promise((resolve,reject)=>{
  const read=index.openCursor(IDBKeyRange.only(scope),'prev');
  read.onerror=()=>reject(read.error);
  read.onsuccess=()=>{
   const entry=read.result?.value;
   resolve(entry?.directory?{directory:entry.directory,path:entry.folder}:null);
  };
 });
}
async function thumbnailFor(blob){
 if(!blob)return null;
 let image;
 try{
  image=await createImageBitmap(blob);
  const scale=Math.min(1,256/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/webp',.75);
 }catch{return null;}finally{image?.close();}
}
export async function recordDownload(scope,name,folder,blob){
 const thumbnail=await thumbnailFor(blob);
 const tx=(await database()).transaction('downloads','readwrite');
 const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 tx.objectStore('downloads').add({scope,name,time:Date.now(),thumbnail,...(folder?.directory&&{folder:folder.path,directory:folder.directory})});await done;
}
export async function downloads(scope,requestedPage=0){
 const index=(await database()).transaction('downloads').objectStore('downloads').index('scope');
 const result=await new Promise((resolve,reject)=>{
  const count=index.count(scope);
  count.onerror=()=>reject(count.error);
  count.onsuccess=()=>{
   const total=count.result,pages=Math.ceil(total/30),page=Math.max(0,Math.min(requestedPage,pages-1)),items=[];
   const read=index.openCursor(IDBKeyRange.only(scope),'prev');let skip=page*30;
   read.onerror=()=>reject(read.error);
   read.onsuccess=()=>{
    const cursor=read.result;
    if(cursor&&skip){cursor.advance(skip);skip=0;return;}
    if(cursor){items.push(cursor.value);if(items.length<30){cursor.continue();return;}}
    resolve({items,page,pages,total});
   };
  };
 });
 const items=result.items.map(({id,name,time,folder,thumbnail})=>({id,name,time,thumbnail,status:folder?'saved':'download',folder:folder||'浏览器下载'}));
 return {...result,items};
}

export async function downloadThumbnail(scope,id){
 const db=await database(),request=db.transaction('downloads').objectStore('downloads').get(id);
 const entry=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 if(entry?.scope!==scope)return null;
 if(entry.thumbnail)return entry.thumbnail;
 try{
  if(!entry.directory||await entry.directory.queryPermission({mode:'read'})!=='granted')return null;
  const file=await entry.directory.getFileHandle(entry.name),thumbnail=await thumbnailFor(await file.getFile());
  if(thumbnail)db.transaction('downloads','readwrite').objectStore('downloads').put({...entry,thumbnail});
  return thumbnail;
 }catch{return null;}
}
