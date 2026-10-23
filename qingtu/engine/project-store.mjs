import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {optimizationSettings} from './optimization-settings.mjs';
import {validateImportSizes} from './import-sizes.mjs';
import {INPUT_OPTIONS,SUPPORTED} from './image.mjs';
import {imageGeometry} from './stitch-edits.mjs';
import {validateImportOrder} from './stitch-reset.mjs';
import {originalBytes} from './image-source.mjs';
import {validateLayoutStates} from './canvas-layout-state.mjs';

const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
export async function atomicWrite(destination,bytes){
 const temporary=destination+'.'+randomUUID()+'.tmp';
 await fs.mkdir(path.dirname(destination),{recursive:true});
 try{
  const file=await fs.open(temporary,'wx');
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  await fs.rename(temporary,destination);
  if(process.platform!=='win32'){const dir=await fs.open(path.dirname(destination),'r');try{await dir.sync();}finally{await dir.close();}}
 }finally{await fs.rm(temporary,{force:true});}
}
export class ProjectStore{
 constructor(root){this.root=root;this.pending=Promise.resolve();}
 file(id,suffix='.json'){if(!validId(id))throw new Error('项目标识无效');return path.join(this.root,'projects',id+suffix);}
 assetFile(id){if(!/^[a-f0-9]{64}$/.test(id))throw new Error('图片标识无效');return path.join(this.root,'assets',id);}
 async import(buffer,name){
  if(!Buffer.isBuffer(buffer)||buffer.length>100*1024*1024)throw new Error('单张图片须小于 100 MB');
  const meta=await sharp(buffer,INPUT_OPTIONS).metadata();
  if(!SUPPORTED.includes(meta.format)||meta.pages>1||meta.depth!=='uchar')throw new Error('图像编辑支持单帧 8 位 JPEG、PNG、WebP、AVIF、TIFF');
  const assetId=createHash('sha256').update(buffer).digest('hex');
  try{await fs.access(this.assetFile(assetId));}catch{await atomicWrite(this.assetFile(assetId),buffer);}
  const rotated=[5,6,7,8].includes(meta.orientation);
  const image={id:randomUUID(),assetId,name:path.basename(String(name).replaceAll('\\','/')).slice(0,200),width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,bytes:buffer.length};
  return {...image,preview:await this.preview(assetId)};
 }
 async readAsset(id){return fs.readFile(this.assetFile(id));}
 // Editor layers are visible immediately, before full composition/encoding.
 // Keep enough pixels for Retina canvas viewing; card thumbnails stay 160px.
 async preview(id){const data=await sharp(await this.readAsset(id),INPUT_OPTIONS).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer();return 'data:image/png;base64,'+data.toString('base64');}
 async load(id){
  let project;
  try{project=JSON.parse(await fs.readFile(this.file(id),'utf8'));}
  catch(error){try{project=JSON.parse(await fs.readFile(this.file(id,'.backup.json'),'utf8'));project.recovered=true;}catch{throw error;}}
  this.validate(project);
  return project;
 }
 validate(project){
  if(!project||!validId(project.id)||!Array.isArray(project.images)||project.images.length>100)throw new Error('项目数据无效');
  optimizationSettings(project.optimization);
  validateImportSizes(project);
  validateImportOrder(project);
  validateLayoutStates(project);
  if(Buffer.byteLength(JSON.stringify(project))>2*1024*1024)throw new Error('项目数据过大');
  if(project.thumbnail!=null&&(typeof project.thumbnail!=='string'||!project.thumbnail.startsWith('data:image/png;base64,')||project.thumbnail.length>200000))throw new Error('画布缩略图无效');
  if(project.edits!=null&&(typeof project.edits!=='object'||Array.isArray(project.edits)))throw new Error('单图编辑数据无效');
  if(project.canvasMode!=null&&project.canvasMode!=='fixed')throw new Error('画布模式无效');
  if(project.canvasMode==='fixed'){
   // Illegal user dimensions may be saved for recovery, but render validates
   // the pixel/ratio limits before allocating a raster or claiming success.
   if(!project.canvas||![project.canvas.width,project.canvas.height].every(Number.isFinite))throw new Error('画布尺寸数据无效');
   for(const image of project.images){const p=project.positions?.[image.id];if(!p||![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0||[p.x,p.y,p.width,p.height].some(v=>Math.abs(v)>Number.MAX_SAFE_INTEGER/4))throw new Error('图片位置或尺寸无效');}
  }
  for(const image of project.images){this.assetFile(image.assetId);if(!validId(image.id)||![image.width,image.height,image.bytes].every(v=>Number.isInteger(v)&&v>0))throw new Error('图片数据无效');imageGeometry(image,project.edits?.[image.id]);}
  if(originalBytes(project.images)>500*1024*1024)throw new Error('每个项目最多 100 张、500 MB');
 }
 save(project){
  const copy=structuredClone(project);delete copy.recovered;this.validate(copy);
  const task=this.pending.catch(()=>{}).then(async()=>{
   for(const image of copy.images)await fs.access(this.assetFile(image.assetId));
   const location=this.file(copy.id);
   // The backup always contains a verified prior committed generation.
   try{const prior=await this.load(copy.id);delete prior.recovered;await atomicWrite(this.file(copy.id,'.backup.json'),JSON.stringify(prior));}catch(error){if(error.code!=='ENOENT')throw error;}
   copy.updatedAt=Date.now();await atomicWrite(location,JSON.stringify(copy));return {saved:true,updatedAt:copy.updatedAt,thumbnail:copy.thumbnail};
  });this.pending=task;return task;
 }
 async list(){
  await fs.mkdir(path.join(this.root,'projects'),{recursive:true});
  const names=await fs.readdir(path.join(this.root,'projects')),out=[];
  for(const name of names.filter(n=>n.endsWith('.json')&&!n.endsWith('.backup.json'))){
   try{const p=await this.load(name.slice(0,-5));out.push({id:p.id,name:p.name,updatedAt:p.updatedAt,count:p.images.length,recovered:p.recovered,thumbnail:p.thumbnail});}
   catch{out.push({id:name.slice(0,-5),name:'项目恢复失败',error:'项目文件损坏，请保留数据并检查备份'});}
  }return out.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 }
 async remove(id){
  await this.pending;await fs.rm(this.file(id),{force:true});await fs.rm(this.file(id,'.backup.json'),{force:true});
  // Originals outside this store are never touched. Keep copied assets that
  // still belong to any committed project or backup.
  const referenced=new Set();
  const names=await fs.readdir(path.join(this.root,'projects'));
  for(const name of names.filter(n=>n.endsWith('.json')))try{for(const image of JSON.parse(await fs.readFile(path.join(this.root,'projects',name))).images)referenced.add(image.assetId);}catch{return true;}
  for(const name of await fs.readdir(path.join(this.root,'assets')).catch(()=>[]))if(/^[a-f0-9]{64}$/.test(name)&&!referenced.has(name))await fs.rm(this.assetFile(name));
  return true;
 }
 flush(){return this.pending;}
}
