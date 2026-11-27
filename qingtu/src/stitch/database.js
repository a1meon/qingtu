let database;
export const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export const finished=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('本地存储失败'));});
export async function db(){
 if(!database)database=new Promise((resolve,reject)=>{
  const open=indexedDB.open('qingtu-stitch',1);
  open.onupgradeneeded=()=>{open.result.createObjectStore('projects',{keyPath:'id'});open.result.createObjectStore('assets',{keyPath:'id'});};
  open.onsuccess=()=>resolve(open.result);open.onerror=()=>{database=null;reject(open.error);};
 });return database;
}

export async function readAsset(id){
 const tx=(await db()).transaction('assets');
 return (await request(tx.objectStore('assets').get(id)))?.blob;
}

export async function readAssetRecords(ids){
 const tx=(await db()).transaction('assets'),assets=tx.objectStore('assets');
 const values=await Promise.all(ids.map(id=>request(assets.get(id))));
 return new Map(ids.map((id,i)=>[id,values[i]]));
}

export async function cacheAssetPreview(id,preview){
 const tx=(await db()).transaction('assets','readwrite'),assets=tx.objectStore('assets');
 const done=finished(tx),read=assets.get(id);
 read.onsuccess=()=>{if(read.result&&!read.result.sourcePreview)assets.put({...read.result,sourcePreview:preview});};
 return done;
}

export async function commitProject(value,expectedRevision,originals,previews=new Map()){
 const tx=(await db()).transaction(['projects','assets'],'readwrite',{durability:'strict'});
 const done=finished(tx),projects=tx.objectStore('projects'),assets=tx.objectStore('assets');
 // Schedule dependent writes in IDB callbacks, while the transaction is active.
 let failure;
 const read=projects.get(value.id);
 read.onsuccess=()=>{
  const actual=read.result?(read.result.revision??0):null;
  if(actual!==expectedRevision){
   failure=Object.assign(new Error('另一页面已更改或删除此画布。可将本页编辑另存为副本。'),{code:'PROJECT_CONFLICT'});
   tx.abort();return;
  }
  value.revision=(actual??0)+1;
  const previous=read.result;
  projects.put(value);
  const currentIds=new Set(value.images.map(image=>image.assetId));
  const removed=previous?.images.filter(image=>!currentIds.has(image.assetId))||[];
  if(removed.length)pruneAssets(projects,assets,removed);
  for(const id of currentIds){
   const lookup=assets.getKey(id);
   lookup.onsuccess=()=>{
    if(lookup.result!==undefined)return;
    const blob=originals.get(id);
    if(blob)assets.put({id,blob,sourcePreview:previews.get(id)});
    else if(!failure){failure=new Error('原图副本缺失，项目尚未保存');tx.abort();}
   };
  }
 };
 try{await done;}catch(error){throw failure||error;}
 return {saved:true,revision:value.revision,updatedAt:value.updatedAt,thumbnail:value.thumbnail};
}

// Only reconsider originals removed by this transaction. Other open editors may
// already have imported files or other projects may share the same original.
function pruneAssets(projects,assets,removed){
 const candidates=new Set(removed.map(image=>image.assetId));
 if(!candidates.size)return;
 const manifests=projects.getAll();
 manifests.onsuccess=()=>{
  for(const project of manifests.result)for(const image of project.images)candidates.delete(image.assetId);
  for(const id of candidates)assets.delete(id);
 };
}

export async function deleteProjects(selection){
 const tx=(await db()).transaction(['projects','assets'],'readwrite',{durability:'strict'});
 const done=finished(tx),projects=tx.objectStore('projects'),assets=tx.objectStore('assets');
 const expected=new Map(selection.map(({id,revision})=>[id,revision??0]));
 let failure;
 const read=projects.getAll();
 read.onsuccess=()=>{
  const removed=[];
  for(const project of read.result){
   if(!expected.has(project.id))continue;
   if((project.revision??0)!==expected.get(project.id)){
    failure=new Error('另一页面已修改画布，请重新打开画布确认后再删除');tx.abort();return;
   }
   projects.delete(project.id);removed.push(...project.images);
  }
  pruneAssets(projects,assets,removed);
 };
 try{await done;}catch(error){throw failure||error;}
}
