import { ImageService } from '../engine/service.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProjectStore} from '../engine/project-store.mjs';
import {StitchService} from '../engine/stitch-service.mjs';

export function allowsLocalRequest({method,headers}){
  if(method!=='POST')return false;
  try{const origin=new URL(headers.origin);return ['http:','https:'].includes(origin.protocol)&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)&&origin.host===headers.host;}
  catch{return false;}
}

export function devBridge() {
  const service=new ImageService();
  const store=new ProjectStore(path.resolve('.cache/browser-stitch-engine'));
  const stitching=new StitchService(store,service);
  let samplesPromise;
  // The preview writes real files: default ~/Pictures/轻图output, like the
  // desktop app, with a native folder chooser on macOS.
  const folders=new Map(),defaultFolder=path.join(os.homedir(),'Pictures','轻图output');
  const scopeOf=value=>value==='stitch'?'stitch':'compression';
  const describe=folder=>({name:path.basename(folder),path:folder});
  async function chooseFolder(scope){
    const current=folders.get(scope)||defaultFolder;
    if(process.platform!=='darwin')return describe(current);
    await fs.mkdir(current,{recursive:true}).catch(()=>{});
    try{
      const script=`POSIX path of (choose folder with prompt "选择导出目录" default location (POSIX file ${JSON.stringify(current)}))`;
      const {stdout}=await promisify(execFile)('osascript',['-e',script]);
      const chosen=stdout.trim().replace(/\/$/,'');
      if(chosen)folders.set(scope,chosen);
      return describe(folders.get(scope)||current);
    }catch{return null;}
  }
  return {name:'qingtu-local-engine',configureServer(server){
    server.middlewares.use('/__qingtu',async(req,res)=>{
      res.setHeader('Content-Type','application/json');
      if(!allowsLocalRequest(req)) {res.statusCode=403;res.end('{}');return;}
      try {
        const chunks=[];let bytes=0;
        for await(const chunk of req) {bytes+=chunk.length;if(bytes>140*1024*1024) throw new Error('图片太大');chunks.push(chunk);}
        const {method,args=[]}=JSON.parse(Buffer.concat(chunks).toString());
        let result;
        if(!Array.isArray(args))throw new Error('参数无效');
        if(method==='stitchImport'){
          const f=args[0];if(!f||typeof f.base64!=='string'||f.base64.length>140*1024*1024)throw new Error('图片数据无效');result=await store.import(Buffer.from(f.base64,'base64'),f.name,{reference:args[1]===true});
        }else if(method==='stitchPreviews'){
          result=await store.previews(args[0]);
        }else if(method==='stitchMissing'){
          if(!Array.isArray(args[0])||args[0].length>100)throw new Error('图片参数无效');result=[];for(const id of args[0])try{await fs.access(store.assetFile(id));}catch(error){if(error.code!=='ENOENT')throw error;result.push(id);}
        }else if(method==='stitchRender')result=await stitching.render(...args);
        else if(method==='stitchRelease'){stitching.release(args[0]);result=true;}
        else if(method==='samples') {
          if(samplesPromise && !(await samplesPromise).every(item=>service.files.has(item.id)))samplesPromise=null;
          samplesPromise ??= Promise.all(['alpine-lake','forest-cabin','coastline'].map(async name=>service.add(await fs.readFile(path.join(server.config.root,'public/samples',name+'.jpg')),name+'.jpg',true)));
          result=await samplesPromise;
        } else if(method==='importFiles') {
          result={items:[],errors:[]};
          for(const f of args[0]) try{result.items.push(await service.add(Buffer.from(f.base64,'base64'),f.name));}catch(e){result.errors.push(f.name+'：'+e.message);}
        } else if(method==='process') result=await service.process(...args);
        else if(method==='rename')result=service.rename(...args);
        else if(method==='remove') {service.remove(args[0]);result=true;}
        else if(method==='outputFolder') result=describe(folders.get(scopeOf(args[0]))||defaultFolder);
        else if(method==='chooseFolder') result=await chooseFolder(scopeOf(args[0]));
        else if(method==='save') {
          const folder=folders.get(scopeOf(args[1]))||defaultFolder;
          await fs.mkdir(folder,{recursive:true});
          const {mime,base64}=service.download(args[0]);
          const saved=await service.save(args[0],folder);
          result={name:path.basename(saved.path),mime,base64,...saved};
        }
        else if(method==='revealFolder') {
          const folder=folders.get(scopeOf(args[0]))||defaultFolder;
          await fs.mkdir(folder,{recursive:true});
          if(process.platform==='darwin')execFile('open',[folder]);
          result=true;
        }
        else throw new Error('不支持的操作');
        res.end(JSON.stringify({result}));
      } catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
    });
  }};
}
