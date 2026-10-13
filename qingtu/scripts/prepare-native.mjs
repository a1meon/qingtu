import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [platform,arch]=process.argv.slice(2);
const packages={
 'darwin-arm64':[['@img/sharp-darwin-arm64','0.35.5'],['@img/sharp-libvips-darwin-arm64','1.3.4']],
 'darwin-x64':[['@img/sharp-darwin-x64','0.35.5'],['@img/sharp-libvips-darwin-x64','1.3.4']],
 'win32-x64':[['@img/sharp-win32-x64','0.35.5']]
};
const wanted=packages[platform+'-'+arch];
if(!wanted)throw new Error('Supported targets: darwin arm64, darwin x64, win32 x64');
for(const [name,version] of wanted){
 const destination=path.resolve('node_modules',name);
 try{if(JSON.parse(await fs.readFile(path.join(destination,'package.json'),'utf8')).version===version){console.log('Present:',name);continue;}}catch{}
 const metadata=await (await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
 const url=new URL(metadata.dist.tarball);
 if(url.hostname!=='registry.npmjs.org')throw new Error('Unexpected package host');
 const buffer=Buffer.from(await (await fetch(url)).arrayBuffer());
 const hash=createHash('sha512').update(buffer).digest('base64');
 if(metadata.dist.integrity!==`sha512-${hash}`)throw new Error('Package integrity mismatch');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-native-package-'));
 try{
  const archive=path.join(temp,'native.tgz');await fs.writeFile(archive,buffer);
  execFileSync('tar',['-xzf',archive,'-C',temp],{stdio:'inherit'});
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.cp(path.join(temp,'package'),destination,{recursive:true});
  console.log('Verified and installed:',name,version);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
