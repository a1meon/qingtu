import {api,desktop,readFile} from '../api.js';
import {canvasThumbnail} from './thumbnail.js';

let database;
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const finished=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('本地存储失败'));});
async function db(){
 if(!database)database=new Promise((resolve,reject)=>{
  const open=indexedDB.open('qingtu-stitch',1);
  open.onupgradeneeded=()=>{open.result.createObjectStore('projects',{keyPath:'id'});open.result.createObjectStore('assets',{keyPath:'id'});};
  open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
 });return database;
}
const storageError=error=>new Error(error?.name==='QuotaExceededError'?'本地空间不足，项目尚未保存。请释放空间后重试':`项目保存失败：${error?.message||'本地存储不可用'}`);
function clean(project){return {...project,images:project.images.map(({preview,...image})=>image),updatedAt:Date.now()};}
export const repository={
 async list(){
  if(desktop)return api.stitchList();
  const tx=(await db()).transaction('projects'),all=await request(tx.objectStore('projects').getAll());
  return all.map(p=>({id:p.id,name:p.name,updatedAt:p.updatedAt,count:p.images.length,thumbnail:p.thumbnail})).sort((a,b)=>b.updatedAt-a.updatedAt);
 },
 async load(id){
  if(desktop)return api.stitchLoad(id);
  const tx=(await db()).transaction('projects'),project=await request(tx.objectStore('projects').get(id));
  if(!project)throw new Error('项目不存在');return project;
 },
 async save(project){
  const value=clean(project);
  try{
   value.thumbnail=await canvasThumbnail(project);
   if(desktop)return await api.stitchSave(value);
   const tx=(await db()).transaction(['projects','assets'],'readwrite',{durability:'strict'}),done=finished(tx);
   tx.objectStore('projects').put(value);
   await done;return {saved:true,updatedAt:value.updatedAt,thumbnail:value.thumbnail};
  }catch(error){throw storageError(error);}
 },
 async import(file){
  if(file.size>100*1024*1024)throw new Error('单张图片须小于 100 MB');
  const image=await api.stitchImport(await readFile(file));
  if(!desktop){
   try{const tx=(await db()).transaction('assets','readwrite',{durability:'strict'}),done=finished(tx);tx.objectStore('assets').put({id:image.assetId,blob:file});await done;}
   catch(error){throw storageError(error);}
   navigator.storage?.persist?.().catch(()=>{});
  }return image;
 },
 async prepare(project,{previews=true}={}){
  if(!desktop){
   const missing=await api.stitchMissing(project.images.map(i=>i.assetId));
   for(const id of missing){
    const tx=(await db()).transaction('assets'),asset=await request(tx.objectStore('assets').get(id));
    if(!asset?.blob)throw new Error('原图副本缺失，项目无法恢复');
    const image=project.images.find(i=>i.assetId===id);await api.stitchImport(await readFile(new File([asset.blob],image.name)));
   }
  }
  if(!previews)return project;
  const urls=await api.stitchPreviews(project.images.map(i=>i.assetId));
  return {...project,images:project.images.map((i,n)=>({...i,preview:urls[n]}))};
 },
 async remove(id){
  if(desktop)return api.stitchDelete(id);
  const tx=(await db()).transaction(['projects','assets'],'readwrite',{durability:'strict'}),done=finished(tx);
  tx.objectStore('projects').delete(id);
  const all=await request(tx.objectStore('projects').getAll()),used=new Set(all.flatMap(p=>p.images.map(i=>i.assetId)));
  const assets=await request(tx.objectStore('assets').getAllKeys());for(const asset of assets)if(!used.has(asset))tx.objectStore('assets').delete(asset);
  await done;return true;
 }
};

export function newProject(){return {id:crypto.randomUUID(),name:'拼图',images:[],layout:'horizontal',grid:{rows:2,columns:2},positions:{},edits:{},canvas:null,export:{format:'png',longEdge:5999,targetBytes:10000000,unit:'MB'},updatedAt:Date.now()};}
