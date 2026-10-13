const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {createHash}=require('node:crypto');
const {assembleParts,validateParts}=require('../desktop/chunk-download.cjs');
const hash=b=>createHash('sha512').update(b).digest('base64');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-parts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const data=[Buffer.from('abcd'),Buffer.from('efgh'),Buffer.from('ij')];let broken=false,truncated=false;const hits=[0,0,0];
 const server=http.createServer((req,res)=>{const i=Number(req.url.slice(-1));hits[i]++;if(i===1&&broken){res.writeHead(503);res.end();return;}res.end(i===1&&truncated?data[i].subarray(0,2):data[i]);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/v0.4.3/`;
 const file={url:'Qingtu-win-x64.exe',size:10,sha512:hash(Buffer.from('abcdefghij')),qingtuParts:data.map((b,i)=>({url:'part'+i,size:b.length,sha512:hash(b)}))};
 return {root,base,file,hits,data,setBroken:v=>broken=v,setTruncated:v=>truncated=v};
}
test('real HTTP parts reassemble exact bytes; verified repeat download uses cache',async t=>{
 const f=await fixture(t);const progress=[];const result=await assembleParts(f.file,f.base,f.root,{onProgress:n=>progress.push(n)});
 assert.equal((await fs.readFile(result)).toString(),'abcdefghij');assert.deepEqual(f.hits,[1,1,1]);assert.equal(progress.at(-1),10);
 await assembleParts(f.file,f.base,f.root);assert.deepEqual(f.hits,[1,1,1]);
});
test('interrupted transfer cannot stage an installer and retry reuses only verified pieces',async t=>{
 const f=await fixture(t);f.setBroken(true);await assert.rejects(assembleParts(f.file,f.base,f.root),/下载/);
 f.setBroken(false);const file=await assembleParts(f.file,f.base,f.root);assert.equal((await fs.readFile(file)).toString(),'abcdefghij');assert.deepEqual(f.hits,[1,2,1]);
});
test('truncated and corrupt parts are rejected; corrupt full cache is rebuilt',async t=>{
 const f=await fixture(t);f.setTruncated(true);await assert.rejects(assembleParts(f.file,f.base,f.root),/校验|体积/);
 f.setTruncated(false);const result=await assembleParts(f.file,f.base,f.root);await fs.writeFile(result,'0123456789');
 assert.equal((await fs.readFile(await assembleParts(f.file,f.base,f.root))).toString(),'abcdefghij');
});
test('whole installer hash is verified independently from valid per-part hashes',async t=>{
 const f=await fixture(t);await assert.rejects(assembleParts({...f.file,sha512:hash(Buffer.from('xxxxxxxxxx'))},f.base,f.root),/完整包.*校验/);
});
test('invalid totals, unbounded sizes and escaping part names fail before HTTP',async t=>{
 const f=await fixture(t);
 assert.doesNotThrow(()=>validateParts(f.file,f.base));
 for(const bad of [{...f.file,size:11},{...f.file,size:2**32},{...f.file,qingtuParts:[{...f.file.qingtuParts[0],url:'../outside'}]},{...f.file,qingtuParts:[{...f.file.qingtuParts[0],url:'https://evil.test/part'}]}])assert.throws(()=>validateParts(bad,f.base),/分片|大小|体积/);
 assert.deepEqual(f.hits,[0,0,0]);
});
test('cancelled download never fetches or produces a completed installer',async t=>{
 const f=await fixture(t);const abort=new AbortController();abort.abort();await assert.rejects(assembleParts(f.file,f.base,f.root,{signal:abort.signal}),{name:'AbortError'});assert.deepEqual(f.hits,[0,0,0]);
});
test('loopback requires the exact private route and host, denies ranges, serves only verified bytes',async t=>{
 const f=await fixture(t);const {ChunkTransport}=require('../desktop/chunk-download.cjs');const transport=await new ChunkTransport(f.root).start();t.after(()=>transport.close());const url=transport.register(f.file,f.base);
 assert.equal((await fetch(new URL('/unknown',url))).status,404);
 const wrongHost=await new Promise((resolve,reject)=>{http.get(url,{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(wrongHost,404);
 assert.equal((await fetch(url,{headers:{Range:'bytes=0-1'}})).status,409);
 const response=await fetch(url);assert.equal(response.status,200);assert.equal(await response.text(),'abcdefghij');
 transport.reset();assert.equal((await fetch(url)).status,404);
});
test('same-size corrupt remote part cannot produce complete installer',async t=>{
 const f=await fixture(t);f.data[1].fill(120);await assert.rejects(assembleParts(f.file,f.base,f.root),/校验/);
 const entries=await fs.readdir(path.join(f.root,Buffer.from(f.file.sha512,'base64').toString('hex')));assert.equal(entries.includes('complete'),false);assert.equal(entries.some(n=>n.includes('partial')),false);
});
test('cancelling an active HTTP body removes temporary data and permits a clean retry',async t=>{
 const f=await fixture(t);const abort=new AbortController();let started;
 const start=new Promise(r=>started=r);const slow=http.createServer((req,res)=>{res.write(Buffer.from('ab'));started();});await new Promise(r=>slow.listen(0,'127.0.0.1',r));t.after(()=>{slow.closeAllConnections();slow.close();});
 const pending=assembleParts(f.file,`http://127.0.0.1:${slow.address().port}/`,f.root,{signal:abort.signal});await start;abort.abort();await assert.rejects(pending,{name:'AbortError'});
 const dir=path.join(f.root,Buffer.from(f.file.sha512,'base64').toString('hex'));assert.deepEqual(await fs.readdir(dir),[]);
 assert.equal((await fs.readFile(await assembleParts(f.file,f.base,f.root))).toString(),'abcdefghij');
});
test('private appcast route is served without starting executable downloads and reset revokes it',async t=>{
 const f=await fixture(t);const {ChunkTransport}=require('../desktop/chunk-download.cjs');const transport=await new ChunkTransport(f.root).start();t.after(()=>transport.close());const url=transport.registerText('<rss/>');assert.equal(await(await fetch(url)).text(),'<rss/>');assert.deepEqual(f.hits,[0,0,0]);transport.reset();assert.equal((await fetch(url)).status,404);
});
