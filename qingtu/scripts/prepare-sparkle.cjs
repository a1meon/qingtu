const fs=require('node:fs/promises');const path=require('node:path');const {execFileSync}=require('node:child_process');const {createHash}=require('node:crypto');
async function prepare(arch='arm64'){
 if(!['arm64','x64'].includes(arch))throw new Error('Invalid Mac architecture');
 const archive=path.join(path.dirname(require.resolve('electron-sparkle/package.json')),'dist/Sparkle-2.9.6.zip');
 const hash=createHash('sha256').update(await fs.readFile(archive)).digest('hex');if(hash!=='8d5fb41d960b43f4a68aa14126bf62b098544ec8d191cdcc73eb14e63a8e7606')throw new Error('Sparkle archive checksum mismatch');
 await fs.mkdir('.cache/sparkle',{recursive:true});execFileSync('/usr/bin/unzip',['-q','-o',archive,'-d','.cache/sparkle']);await fs.mkdir('build/sparkle',{recursive:true});
 const framework=path.resolve('.cache/sparkle/Sparkle.xcframework/macos-arm64_x86_64');
 const headers=path.join(path.dirname(require.resolve('node-api-headers/package.json')),'include');
 execFileSync('/usr/bin/xcrun',['clang++','-arch',arch==='x64'?'x86_64':'arm64','-mmacosx-version-min=12.0','-std=c++17','-fobjc-arc','-fblocks','-shared','-undefined','dynamic_lookup','-I',headers,'-F',framework,'-framework','Cocoa','-framework','Sparkle','-Wl,-rpath,@loader_path/../Frameworks','desktop/native/sparkle.mm','-o',`build/sparkle/qingtu-sparkle-${arch}.node`],{stdio:'inherit'});
 console.log(`Built Sparkle bridge for ${arch}`);
}
module.exports={prepare};if(require.main===module)prepare(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
