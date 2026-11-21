import { ImageService } from '../engine/service.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
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
          const f=args[0];if(!f||typeof f.base64!=='string'||f.base64.length>140*1024*1024)throw new Error('图片数据无效');result=await store.import(Buffer.from(f.base64,'base64'),f.name);
        }else if(method==='stitchPreviews'){
          if(!Array.isArray(args[0])||args[0].length>100)throw new Error('图片参数无效');result=[];for(const id of args[0])result.push(await store.preview(id));
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
        else if(method==='outputFolder'||method==='chooseFolder') result={name:'预览导出目录',path:path.join(server.config.root,'artifacts/browser-exports')};
        else if(method==='save') {
          const folder=path.join(server.config.root,'artifacts/browser-exports');
          await fs.mkdir(folder,{recursive:true});
          result={...service.download(args[0]),...await service.save(args[0],folder)};
        }
        else throw new Error('不支持的操作');
        res.end(JSON.stringify({result}));
      } catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
    });
  }};
}
