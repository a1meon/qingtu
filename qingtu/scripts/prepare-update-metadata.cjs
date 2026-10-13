const fs=require('node:fs/promises');
const path=require('node:path');
const yaml=require('js-yaml');
async function prepareMetadata(platform,arch){
 const source=JSON.parse(await fs.readFile('build/update-source.json','utf8'));
 if(source.provider!=='gitee'||!source.owner||!source.repo)return;
 const filename=platform==='darwin'?'latest-mac.yml':'latest.yml';
 const output=platform==='darwin'?`latest-${arch}-mac.yml`:filename;
 const info=yaml.load(await fs.readFile(path.join('release',filename),'utf8'));
 const base=`https://gitee.com/${source.owner}/${source.repo}/releases/download/v${info.version}/`;
 for(const file of info.files)file.url=new URL(path.basename(decodeURIComponent(file.url)),base).href;
 // Gitee has a flat release attachment directory. Mac architectures use
 // distinct channel files; artifacts are immutable version-specific URLs.
 await fs.writeFile(path.join('release',output),yaml.dump(info));
 console.log('Prepared Gitee update metadata: '+output);
}
module.exports={prepareMetadata};
if(require.main===module)prepareMetadata(...process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
