const fs=require('node:fs/promises');const path=require('node:path');const {execFileSync}=require('node:child_process');
async function prepareInstaller(out,arch){
 if(!['arm64','x64'].includes(arch))throw new Error('Invalid architecture');const {version}=require('../package.json');const source=path.join(out,`Install-Qingtu-${version}-Mac-${arch}.command`);const dir=path.resolve(`.cache/mac-installer-${version}-${arch}`);await fs.mkdir(dir,{recursive:true});await fs.copyFile(source,path.join(dir,'安装轻图.command'));await fs.chmod(path.join(dir,'安装轻图.command'),0o755);
 const target=path.resolve(out,`Qingtu-${version}-Mac-${arch}-Installer.dmg`);execFileSync('/usr/bin/hdiutil',['create','-ov','-volname','轻图安装','-fs','HFS+','-format','UDZO','-srcfolder',dir,target],{stdio:'inherit'});return target;
}
module.exports={prepareInstaller};if(require.main===module)prepareInstaller(...process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
