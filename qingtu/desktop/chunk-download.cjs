const fs=require('node:fs/promises');const {createReadStream}=require('node:fs');
const path=require('node:path');const {createHash,randomUUID}=require('node:crypto');
const http=require('node:http');const {pipeline}=require('node:stream/promises');
const {MAX_PATCH,applyDelta}=require('./update-delta.cjs');
const {fromMirrors}=require('./update-source.cjs');
const MAX_PART=64*1024*1024,MAX_FILE=1024*1024*1024;
const digestValid=value=>typeof value==='string'&&Buffer.from(value,'base64').length===64&&Buffer.from(value,'base64').toString('base64')===value;
function validateParts(file,base){
 const origin=new URL(base);
 if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'))throw new Error('分片源须为 HTTPS');
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_FILE||!digestValid(file.sha512)||!Array.isArray(file.qingtuParts)||file.qingtuParts.length<1||file.qingtuParts.length>32)throw new Error('分片大小或校验信息无效');
 let total=0;const seen=new Set();
 for(const part of file.qingtuParts){
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part.url)||seen.has(part.url)||!Number.isSafeInteger(part.size)||part.size<1||part.size>MAX_PART||!digestValid(part.sha512))throw new Error('分片信息无效');
  seen.add(part.url);total+=part.size;
 }
 if(total!==file.size)throw new Error('分片总体积不匹配');
 return file;
}
// Older releases describe parts. New releases name a single immutable archive.
function validateArchive(file, base) {
 if (file?.qingtuParts !== undefined) return validateParts(file,base);
 const origin=new URL(base);
 if (origin.protocol!=='https:' && !(origin.protocol==='http:' && origin.hostname==='127.0.0.1')) throw new Error('更新源须为 HTTPS');
 if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(exe|zip)$/.test(file?.url) ||
     !Number.isSafeInteger(file.size) || file.size<1 || file.size>MAX_FILE || !digestValid(file.sha512)) throw new Error('完整包名称、大小或校验信息无效');
 return file;
}
async function fileDigest(file){
 const hash=createHash('sha512');
 for await(const bytes of createReadStream(file))hash.update(bytes);
 return hash.digest('base64');
}
async function verified(file,size,sha512){
 try{return (await fs.stat(file)).size===size&&await fileDigest(file)===sha512;}catch{return false;}
}

async function fetchPiece(part,base,tmp,{signal,fetcher,onBytes}){
 const timeout=AbortSignal.timeout(part.size>MAX_PART?1800000:120000);
 const response=await fetcher(new URL(part.url,base).href,{signal:signal?AbortSignal.any([signal,timeout]):timeout});
 if(new URL(base).protocol==='https:'&&response.url&&new URL(response.url).protocol!=='https:')throw new Error('分片源不能降级为 HTTP');
 if(!response.ok||!response.body)throw Object.assign(new Error('分片下载失败'),{fallback:[404,410].includes(response.status)});
 const handle=await fs.open(tmp,'wx',0o600);
 try{
  let size=0;const hash=createHash('sha512');
  for await(const bytes of response.body){
   signal?.throwIfAborted();size+=bytes.length;
   if(size>part.size)throw Object.assign(new Error('分片体积超出声明'),{fallback:true});
   hash.update(bytes);await handle.writeFile(bytes);onBytes(size);
  }
  if(size!==part.size||hash.digest('base64')!==part.sha512)throw Object.assign(new Error('分片校验失败'),{fallback:true});
 }finally{await handle.close();}
}

async function fetchVerifiedPiece(part,sources,tmp,options){
 await fromMirrors(sources,async base=>{
  try{await fetchPiece(part,base,tmp,options);}
  catch(error){await fs.rm(tmp,{force:true});throw error;}
  // A host which worked for this part should handle the next one first.
  sources.splice(sources.indexOf(base),1);sources.unshift(base);
 },options.signal);
}

async function tryDelta(file,sources,root,complete,{signal,fetcher,onProgress,baseFiles}){
 const patch=file.qingtuDelta;
 if(!patch||!Number.isSafeInteger(patch.size)||patch.size<=4||patch.size>=file.size||patch.size>MAX_PATCH||
    !Number.isSafeInteger(patch.baseSize)||patch.baseSize<1||patch.baseSize>MAX_FILE||
    !digestValid(patch.baseSha512)||!digestValid(patch.sha512)||!(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,220}\.qtdelta$/).test(patch.url))return false;
 const cached=path.join(root,Buffer.from(patch.baseSha512,'base64').toString('hex'),'complete');
 let source;
 for(const name of [cached,...baseFiles]){
  signal?.throwIfAborted();
  if(await verified(name,patch.baseSize,patch.baseSha512)){source=name;break;}
 }
 if(!source)return false;
 const tmp=complete+'.delta-'+randomUUID(),restored=tmp+'.restored';
 try{
  onProgress(0,patch.size,'delta');
  try{await fetchVerifiedPiece(patch,sources,tmp,{signal,fetcher,onBytes:n=>onProgress(n,patch.size,'delta')});}
  catch(error){signal?.throwIfAborted();if(error.fallback)return false;throw error;}
  try{await applyDelta(await fs.readFile(tmp),source,restored,file,signal);}
  catch(error){signal?.throwIfAborted();if(!error.code||error.code==='ENOENT')return false;throw error;}
  signal?.throwIfAborted();await fs.rename(restored,complete);
  return true;
 }finally{await fs.rm(tmp,{force:true});await fs.rm(restored,{force:true});}
}

async function assembleParts(file,base,root,{signal,onProgress=()=>{},fetcher=fetch,baseFiles=[],mirrorUrls=[]}={}){
 const sources=[...new Set([base,...mirrorUrls])];
 for(const url of sources)validateArchive(file,url);signal?.throwIfAborted();
 const key=Buffer.from(file.sha512,'base64').toString('hex'),dir=path.join(root,key);
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const complete=path.join(dir,'complete');
 if(await verified(complete,file.size,file.sha512)){onProgress(file.size);return complete;}
 await fs.rm(complete,{force:true});
 if(await tryDelta(file,sources,root,complete,{signal,fetcher,onProgress,baseFiles}))return complete;
 onProgress(0,file.size,'full');
 if (!file.qingtuParts) {
  const tmp=complete+'.partial-'+randomUUID();
  try {
   await fetchVerifiedPiece(file,sources,tmp,{signal,fetcher,onBytes:bytes=>onProgress(bytes,file.size,'full')});
   signal?.throwIfAborted();await fs.rename(tmp,complete);
   return complete;
  } finally { await fs.rm(tmp,{force:true}); }
 }
 let transferred=0;const paths=[];
 for(let i=0;i<file.qingtuParts.length;i++){
  signal?.throwIfAborted();const part=file.qingtuParts[i];const dest=path.join(dir,`${i}-${Buffer.from(part.sha512,'base64').toString('hex')}`);paths.push(dest);
  if(await verified(dest,part.size,part.sha512)){transferred+=part.size;onProgress(transferred,file.size,'full');continue;}
  const tmp=dest+'.partial-'+randomUUID();
  try{
   await fetchVerifiedPiece(part,sources,tmp,{signal,fetcher,onBytes:n=>onProgress(transferred+n,file.size,'full')});
   await fs.rename(tmp,dest);transferred+=part.size;
  }finally{await fs.rm(tmp,{force:true});}
 }
 const tmp=path.join(dir,'complete.partial-'+randomUUID());let handle;
 try{
  handle=await fs.open(tmp,'wx',0o600);const hash=createHash('sha512');let size=0;
  for(const piece of paths)for await(const bytes of createReadStream(piece)){signal?.throwIfAborted();size+=bytes.length;hash.update(bytes);await handle.writeFile(bytes);}
  if(size!==file.size||hash.digest('base64')!==file.sha512)throw new Error('完整包校验失败');
  await handle.close();handle=null;await fs.rename(tmp,complete);
  // Once a complete package exists, pieces are redundant; a verified final
  // file suffices for retries. The per-file cache is capped at two package sizes.
  await Promise.all(paths.map(p=>fs.rm(p,{force:true})));onProgress(file.size);return complete;
 }finally{if(handle)await handle.close();await fs.rm(tmp,{force:true});}
}
class ChunkTransport {
 constructor(root,{fetcher=fetch,baseFiles=[]}={}){this.root=root;this.fetcher=fetcher;this.baseFiles=baseFiles;this.routes=new Map();this.token=randomUUID();}
 async start(){
  this.server=http.createServer((req,res)=>this.serve(req,res));await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',resolve);});this.server.unref();return this;
 }
 register(file,base,onProgress=()=>{},mirrorUrls=[]){
  validateArchive(file,base);const name=path.posix.basename(new URL(file.url,base).pathname);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(exe|zip|dmg)$/.test(name))throw new Error('分片安装包名称无效');
  const route=`/${this.token}/${randomUUID()}/${name}`;
  this.routes.set(route,{file,base,onProgress,mirrorUrls});return new URL(`http://127.0.0.1:${this.server.address().port}${route}`);
 }
 registerText(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw new Error('更新描述过大');
  const route=`/${this.token}/${randomUUID()}/appcast.xml`;this.routes.set(route,{text});return new URL(`http://127.0.0.1:${this.server.address().port}${route}`);
 }
 reset(){this.routes.clear();}
 async serve(req,res){
  const route=this.routes.get(req.url);
  if(req.method!=='GET'||!route||req.headers.host!==`127.0.0.1:${this.server.address().port}`){res.writeHead(404);res.end();return;}
  if(route.text!==undefined){res.writeHead(200,{'Content-Type':'application/xml','Content-Length':Buffer.byteLength(route.text),'Cache-Control':'no-store'});res.end(route.text);return;}
  if(req.headers.range||this.active){res.writeHead(409);res.end();return;}
  this.active=true;const abort=new AbortController();this.activeAbort=abort;const heartbeat=setInterval(()=>{if(!res.headersSent&&!res.destroyed)res.writeProcessing();},15000);heartbeat.unref();res.once('close',()=>{if(!res.writableFinished)abort.abort();});
  try{
   const complete=await assembleParts(route.file,route.base,this.root,{fetcher:this.fetcher,baseFiles:this.baseFiles,signal:abort.signal,mirrorUrls:route.mirrorUrls,onProgress:route.onProgress});
   // Retain the baseline until the replacement is fully verified and staged.
   const keep=path.basename(path.dirname(complete));
   for(const entry of await fs.readdir(this.root,{withFileTypes:true}))if(entry.isDirectory()&&/^[a-f0-9]{128}$/.test(entry.name)&&entry.name!==keep)await fs.rm(path.join(this.root,entry.name),{recursive:true,force:true});
   res.writeHead(200,{'Content-Length':route.file.size,'Content-Type':'application/octet-stream','Cache-Control':'no-store'});await pipeline(createReadStream(complete),res);
  }catch(error){if(!res.headersSent){res.writeHead(502);res.end('分片下载失败');}else res.destroy(error);}
  finally{clearInterval(heartbeat);this.activeAbort=null;this.active=false;}
 }
 close(){this.activeAbort?.abort();this.server?.close();}
}
module.exports={assembleParts,validateParts,validateArchive,ChunkTransport,fileDigest};
