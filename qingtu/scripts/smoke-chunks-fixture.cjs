const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const yaml=require('js-yaml');
const {splitRelease}=require('./prepare-chunk-release.cjs');
(async()=>{
 const root=path.resolve('artifacts/chunks-fixture');await fs.mkdir(root,{recursive:true});
 // Synthetic inert bytes test transport and SDK verification, never installation.
 const bytes=Buffer.alloc(65537);for(let n=0;n<bytes.length;n++)bytes[n]=(n*31+17)%256;
 const name='Qingtu-0.4.3-win-x64.exe',sha512=createHash('sha512').update(bytes).digest('base64');
 await fs.writeFile(path.join(root,name),bytes);await fs.writeFile(path.join(root,'latest.yml'),yaml.dump({version:'0.4.3',files:[{url:name,size:bytes.length,sha512}]}));
 await splitRelease(path.join(root,'latest.yml'),path.join(root,'feed'),16384);console.log(path.join(root,'feed'));
})().catch(error=>{console.error(error);process.exitCode=1;});
