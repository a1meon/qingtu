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
export async function recordDownload(scope,name,folder){
 const tx=(await database()).transaction('downloads','readwrite');
 const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 tx.objectStore('downloads').add({scope,name,time:Date.now(),...(folder?.directory&&{folder:folder.path,directory:folder.directory})});await done;
}
export async function downloads(scope,requestedPage=0){
 const index=(await database()).transaction('downloads').objectStore('downloads').index('scope');
 return new Promise((resolve,reject)=>{
  const count=index.count(scope);
  count.onerror=()=>reject(count.error);
  count.onsuccess=()=>{
   const total=count.result,pages=Math.ceil(total/30),page=Math.max(0,Math.min(requestedPage,pages-1)),items=[];
   const read=index.openCursor(IDBKeyRange.only(scope),'prev');let skip=page*30;
   read.onerror=()=>reject(read.error);
   read.onsuccess=()=>{
    const cursor=read.result;
    if(cursor&&skip){cursor.advance(skip);skip=0;return;}
    if(cursor){const {id,name,time,folder}=cursor.value;items.push({id,name,time,status:folder?'saved':'download',folder:folder||'浏览器下载'});if(items.length<30){cursor.continue();return;}}
    resolve({items,page,pages,total});
   };
  };
 });
}
