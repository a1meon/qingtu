import {api,desktop,readFile,staticBrowser} from '../api.js';
import {defaultCanvasName,nameOrDefault} from '../../engine/output-name.mjs';
import {canvasThumbnail} from './thumbnail.js';
import {rotatePreview} from './rotate-preview.js';
import {PreviewCache} from '../../engine/preview-cache.mjs';
import {restoreSingleImportFrame} from '../../engine/canvas-import.mjs';
import {DEFAULT_CANVAS,canvasRatioLimit} from '../../engine/canvas-limits.mjs';
import {migrateFixedCanvas} from '../../engine/canvas-migrate.mjs';
import {enableHeightCanvas} from '../../engine/canvas-height.mjs';
import {optimizationSettings} from '../../engine/optimization-settings.mjs';
import {validateImportSizes} from '../../engine/import-sizes.mjs';
import {normalizeImageColor,validateColorReference} from '../../engine/image-color.mjs';
import {profileColorReference} from './color-preview.js';

import {db,request,readAsset,commitProject,deleteProjects} from './database.js';

// Keep the active editor's originals available if a different tab deletes its manifest.
let originals=new Map();
const sourcePreviews=new PreviewCache();
const storageError=error=>new Error(error?.name==='QuotaExceededError'?'本地空间不足，项目尚未保存。请释放空间后重试':`项目保存失败：${error?.message||'本地存储不可用'}`);
function clean(project){validateImportSizes(project);validateColorReference(project.colorReference);for(const image of project.images)normalizeImageColor(image.color);return {...project,optimization:optimizationSettings(project.optimization),images:project.images.map(({preview,...image})=>image),updatedAt:Date.now()};}
export const repository={
 rememberImports(items){for(const image of items)if(image.preview)sourcePreviews.set(image.assetId,image.preview,2*image.preview.length);},
 setOriginals(files=new Map()){originals=files;},
 async list(){
  if(desktop)return api.stitchList();
  const tx=(await db()).transaction('projects'),all=await request(tx.objectStore('projects').getAll());
  return all.map(p=>({id:p.id,name:nameOrDefault(p.name,defaultCanvasName(p)),revision:p.revision??0,updatedAt:p.updatedAt,count:p.images.length,thumbnail:p.thumbnail})).sort((a,b)=>b.updatedAt-a.updatedAt);
 },
 async load(id){
  if(desktop)return api.stitchLoad(id);
  const tx=(await db()).transaction('projects'),project=await request(tx.objectStore('projects').get(id));
  if(!project)throw new Error('项目不存在');return project;
 },
 async save(project,expectedRevision=null){
  const value=clean(project);
  try{
   value.thumbnail=await canvasThumbnail(project);
   if(desktop)return await api.stitchSave(value);
   return await commitProject(value,expectedRevision,originals);
  }catch(error){if(error.code==='PROJECT_CONFLICT')throw error;throw storageError(error);}
 },
 async import(file,retained=originals){
  if(file.size>100*1024*1024)throw new Error('单张图片须小于 100 MB');
  const image=await api.stitchImport(await readFile(file));
  if(!desktop){
   retained.set(image.assetId,file);
   navigator.storage?.persist?.().catch(()=>{});
  }return image;
 },
 async importReference(file){
  if(file.size>100*1024*1024)throw new Error('单张图片须小于 100 MB');
  return profileColorReference(await api.stitchReference(await readFile(file)));
 },
 async prepare(project,{previews=true,retain}={}){
  canvasRatioLimit(project.sourceCanvas);
  validateColorReference(project.colorReference);
  for(const image of project.images)normalizeImageColor(image.color);
  const defaultName=defaultCanvasName(project);
  project=enableHeightCanvas(migrateFixedCanvas({...project,defaultName,name:nameOrDefault(project.name,defaultName)}));
  project=restoreSingleImportFrame(project);
  const ids=[...new Set(project.images.map(i=>i.assetId))];
  if(!ids.length)return project;
  if(retain&&!desktop)await Promise.all(ids.map(async id=>{
   const file=originals.get(id)||await readAsset(id);
   if(!file)throw new Error('原图副本缺失，项目无法恢复');
   retain.set(id,file);
  }));
  if(!desktop&&!staticBrowser){
   const missing=await api.stitchMissing(ids);
   for(const id of missing){
    const tx=(await db()).transaction('assets'),asset=await request(tx.objectStore('assets').get(id));
    if(!asset?.blob)throw new Error('原图副本缺失，项目无法恢复');
    const image=project.images.find(i=>i.assetId===id);await api.stitchImport(await readFile(new File([asset.blob],image.name)));
   }
  }
  if(!previews)return project;
  const byId=new Map(),missing=[];
  for(const id of ids){
   const url=sourcePreviews.get(id);
   if(url)byId.set(id,url);else missing.push(id);
  }
  if(desktop&&byId.size&&(await api.stitchMissing([...byId.keys()])).length)throw new Error('原图副本缺失，项目无法恢复');
  if(missing.length){
   const urls=await api.stitchPreviews(missing);
   missing.forEach((id,n)=>{byId.set(id,urls[n]);sourcePreviews.set(id,urls[n],2*urls[n].length);});
  }
  const rotatedPreviews=new Map();
  return {...project,images:await Promise.all(project.images.map(async image=>{const key=`${image.assetId}:${image.rotation||0}`;if(!rotatedPreviews.has(key))rotatedPreviews.set(key,rotatePreview(byId.get(image.assetId),image.rotation||0));return {...image,preview:await rotatedPreviews.get(key)};}))};
 },
 async remove(selection,retained=[]){
  if(desktop){for(const {id} of selection)await api.stitchDelete(id,retained);}
  else await deleteProjects(selection);
 }
};

export function newProject(){return {id:crypto.randomUUID(),name:'图像',images:[],initialOrder:[],canvasMode:'fixed',heightLocked:true,canvasSizing:'content',layout:'horizontal',grid:{rows:2,columns:2},positions:{},edits:{},optimization:optimizationSettings(),canvas:{...DEFAULT_CANVAS},export:{format:'png',longEdge:5999,targetBytes:30000000,unit:'MB'},updatedAt:Date.now()};}
