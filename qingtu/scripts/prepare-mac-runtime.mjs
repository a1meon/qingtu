// Rebuild the pinned upstream host with only Qingtu's AppKit MacWindow adapter.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceHash='fa8397f7ed8bb3fe877245ed7a2063c8b03cc6234e9c40aa8cf177fbe9051bda';
const root=path.resolve('.cache/mac-native-runtime'),archive=path.resolve('.cache/neutralino-src-6.10.0.tar.gz'),adapter=await fs.readFile('desktop/lite/macos/macwindow.mm'),fingerprint=sha(Buffer.concat([Buffer.from(sourceHash),adapter]));
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)throw Error(cmd+' failed: '+r.status);}
await fs.mkdir(root,{recursive:true});
try{await fs.access(archive);}catch{const response=await fetch('https://codeload.github.com/neutralinojs/neutralinojs/tar.gz/refs/tags/v6.10.0');if(!response.ok)throw Error('Neutralino source unavailable');await fs.writeFile(archive,Buffer.from(await response.arrayBuffer()));}
if(sha(await fs.readFile(archive))!==sourceHash)throw Error('Neutralino source checksum mismatch');
const tools=path.resolve('.cache/native-build-tools');
try{await fs.access(path.join(tools,'bin/cmake'));}catch{run('python3',['-m','venv',tools]);run(path.join(tools,'bin/pip'),['install','cmake==3.31.6','ninja==1.11.1.3']);}
const src=path.join(root,'neutralinojs-6.10.0');
try{await fs.access(path.join(src,'CMakeLists.txt'));}catch{run('tar',['-xzf',archive,'-C',root]);}
await fs.writeFile(path.join(src,'lib/webview/macwindow.mm'),adapter);
for(const arch of ['arm64','x86_64']){
 const output=path.join(root,'neutralino-mac_'+(arch==='x86_64'?'x64':arch)),stamp=output+'.json';let cached;try{cached=JSON.parse(await fs.readFile(stamp,'utf8'));}catch{}
 if(cached?.fingerprint===fingerprint){try{if(sha(await fs.readFile(output))===cached.sha256)continue;}catch{}}
 const build=path.join(root,'build-'+arch);run(path.join(tools,'bin/cmake'),['-S',src,'-B',build,'-G','Ninja','-DCMAKE_MAKE_PROGRAM='+path.join(tools,'bin/ninja'),'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_OSX_ARCHITECTURES='+arch,'-DCMAKE_OSX_DEPLOYMENT_TARGET=13.3']);
 run(path.join(tools,'bin/cmake'),['--build',build,'--parallel','4']);
 await fs.copyFile(path.join(src,'bin',path.basename(output)),output);await fs.chmod(output,0o755);await fs.writeFile(stamp,JSON.stringify({version:'6.10.0',sourceHash,fingerprint,sha256:sha(await fs.readFile(output))},null,2)+'\n');
}
