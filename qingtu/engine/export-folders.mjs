import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const scopes=['compression','stitch'];
const pageSize=30;
async function readOptional(file){
 try{return await fs.readFile(file,'utf8');}
 catch(error){if(error.code!=='ENOENT')throw error;return '';}
}
async function fileStatus(file){
 try{return (await fs.stat(file)).isFile()?'available':'missing';}
 catch(error){return ['ENOENT','ENOTDIR'].includes(error.code)?'missing':'unavailable';}
}

export async function loadExportFolders(root){
 const directory=path.join(root,'export-history'),history=new Map(),last=new Map(),unsaved=new Set();
 let pending=Promise.resolve();
 function remember(scope,entry){
  history.get(scope).set(entry.id,entry);
  last.set(scope,{folder:path.dirname(entry.file),usedDefault:entry.usedDefault});
 }
 for(const scope of scopes){
  const entries=new Map();history.set(scope,entries);
  // Older versions stored just the folder. It remains a picker default.
  try{
   const previous=await readOptional(path.join(directory,scope+'.json'));
   const folder=previous&&JSON.parse(previous);
   if(typeof folder==='string'&&path.isAbsolute(folder))last.set(scope,{folder});
  }catch(error){console.warn('读取旧版输出目录失败',error.message);}
  try{
   const log=await readOptional(path.join(directory,scope+'.jsonl'));
   for(const line of log.split('\n')){
    if(!line)continue;
    let entry;try{entry=JSON.parse(line);}catch{continue;}
    if(typeof entry?.id!=='string'||typeof entry.file!=='string'||!path.isAbsolute(entry.file)||!Number.isFinite(new Date(entry.time).getTime())||typeof entry.time!=='number')continue;
    remember(scope,entry);
   }
  }catch(error){console.warn('读取导出历史失败',error.message);}
 }
 return {
  get:scope=>last.get(scope)?.folder??null,
  customFolder(scope,pictures){
   const previous=last.get(scope);
   if(!previous||previous.usedDefault===true)return null;
   // Old records only saved paths. Match the old default inside the OS Pictures folder.
   if(previous.usedDefault===undefined&&path.relative(path.join(pictures,'轻图导出'),previous.folder)==='')return null;
   return previous.folder;
  },
  record(scope,file,usedDefault){
   const entry={id:randomUUID(),file,time:Date.now(),usedDefault};
   remember(scope,entry);
   // Append one completed output, retaining earlier records and duplicate names.
   pending=pending.then(async()=>{
    await fs.mkdir(directory,{recursive:true});
    await fs.appendFile(path.join(directory,scope+'.jsonl'),'\n'+JSON.stringify(entry)+'\n',{flush:true});
   }).catch(error=>{unsaved.add(scope);console.warn('记录导出历史失败',error.message);});
   return pending;
  },
  async list(scope,requestedPage=0){
   const all=Array.from(history.get(scope).values()).reverse(),total=all.length;
   const page=Math.max(0,Math.min(Math.ceil(total/pageSize)-1,Number.isSafeInteger(requestedPage)?requestedPage:0));
   const items=await Promise.all(all.slice(page*pageSize,(page+1)*pageSize).map(async({id,file,time})=>({
    id,name:path.basename(file),folder:path.dirname(file),time,status:await fileStatus(file)
   })));
   return {items,page,total,pages:Math.ceil(total/pageSize),unsaved:unsaved.has(scope)};
  },
  async folderFor(scope,id){
   const entry=history.get(scope).get(id);
   if(!entry)throw new Error('找不到这条导出记录');
   const status=await fileStatus(entry.file);
   if(status!=='available')throw new Error(status==='missing'?'文件或目录已删除或移动':'暂时无法访问该文件');
   return path.dirname(entry.file);
  }
 };
}
