// Temporary full editor for legacy Sparkle clients, including macOS 13.0–13.2.
// Keep publishing this channel while old versions remain supported.
const fs=require('node:fs/promises');const path=require('node:path');const {spawnSync}=require('node:child_process');const {updateBuild}=require('./prepare-update-build.cjs');
const run=(args)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)throw new Error('Bridge build failed');};
(async()=>{
 run(['node_modules/vite/bin/vite.js','build']);
 const pkg=require('../package.json'),source=require('../desktop/update-source.json'),publicKey=require('../desktop/sparkle-public-key.json').publicKey;
 if(pkg.devDependencies.electron!=='44.7.0'||require('electron/package.json').version!=='44.7.0')throw new Error('Re-audit macOS13.0 support before changing the legacy bridge Electron runtime');
 for(const arch of ['arm64','x64']){
  run(['scripts/prepare-native.mjs','darwin',arch]);run(['scripts/prepare-sparkle.cjs',arch]);
  const {config}=updateBuild(source,{...pkg,version:'0.4.9'},'darwin',arch,publicKey);
  config.extraMetadata={version:'0.4.9'};config.directories={...config.directories,output:`release/bridge-0.4.9/${arch}`};config.mac.minimumSystemVersion='13.0';
  config.files.push('!node_modules/wasm-vips/**/*','!node_modules/@neutralinojs/**/*','!node_modules/@noble/**/*','!node_modules/buffer/**/*','!node_modules/path-browserify/**/*','!desktop/lite/**/*','!dist/client/samples/**/*');
  await fs.writeFile('build/update-source.json',JSON.stringify(source));
  const filename=path.resolve(`build/bridge-${arch}.json`);await fs.writeFile(filename,JSON.stringify(config));
  run(['node_modules/electron-builder/cli.js','--config',filename,'--mac','zip','--'+arch,'--publish','never']);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
