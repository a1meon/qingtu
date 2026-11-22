const fs=require('node:fs/promises');const path=require('node:path');const {createHash}=require('node:crypto');const {createReadStream}=require('node:fs');const yaml=require('js-yaml');
const {localBaseline,releaseBaseline,buildDelta}=require('./prepare-update-delta.cjs');
async function splitRelease(metadataPath,outputDir,partSize=64*1024*1024,{zipOnly=false,resolveBase=localBaseline}={}){
 if(!Number.isSafeInteger(partSize)||partSize<1||partSize>64*1024*1024)throw new Error('分片大小无效');
 const info=yaml.load(await fs.readFile(metadataPath,'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(info.version)||!Array.isArray(info.files))throw new Error('版本描述无效');
 if(zipOnly)info.files=info.files.filter(file=>file.url.endsWith('.zip'));
 const bases=require('../desktop/update-source.cjs').releaseHosts(require('../desktop/update-source.json')).map(host=>host.downloads+'v'+info.version+'/');
 await fs.mkdir(outputDir,{recursive:true});const artifacts=[];
 for(const file of info.files){
  const name=path.basename(decodeURIComponent(file.url));if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(exe|zip|dmg)$/.test(name))throw new Error('安装包名称无效');
  const original=path.join(path.dirname(metadataPath),name);const stat=await fs.stat(original);const whole=createHash('sha512');for await(const bytes of createReadStream(original))whole.update(bytes);
  if(stat.size!==file.size||whole.digest('base64')!==file.sha512)throw new Error('安装包校验失败');
  const input=await fs.open(original,'r');const buffer=Buffer.allocUnsafe(Math.min(partSize,stat.size));const parts=[];
  try{for(let position=0,i=1;position<stat.size;i++){
   const size=Math.min(partSize,stat.size-position);let read=0;while(read<size){const result=await input.read(buffer,read,size-read,position+read);if(!result.bytesRead)throw new Error('安装包体积变化');read+=result.bytesRead;}
   const bytes=buffer.subarray(0,size),namePart=`${name}.part${String(i).padStart(2,'0')}`;await fs.writeFile(path.join(outputDir,namePart),bytes);
   parts.push({url:namePart,size,sha512:createHash('sha512').update(bytes).digest('base64')});artifacts.push(namePart);position+=size;
  }}finally{await input.close();}
  file.url=name;file.qingtuParts=parts;
  delete file.qingtuDelta;
  const baseline=await resolveBase(original);
  if(baseline){
   const patch=await buildDelta(original,file,outputDir,baseline);
   if(patch){file.qingtuDelta=patch;artifacts.push(patch.url);}
  }
 }
 info.qingtuMultipart=1;const metadata=path.join(outputDir,path.basename(metadataPath));await fs.writeFile(metadata,yaml.dump(info));artifacts.push(path.basename(metadata));
 let bootstrap;
 const windows=info.files.find(file=>file.url.endsWith('.exe'));
 if(windows){
  const parts=windows.qingtuParts.map(p=>`@{Name='${p.url}';Size=${p.size};Hash='${Buffer.from(p.sha512,'base64').toString('hex').toUpperCase()}'}`).join(';');
  const hash=Buffer.from(windows.sha512,'base64').toString('hex').toUpperCase();
  const ps=`$ErrorActionPreference='Stop';$dir=Join-Path $env:TEMP 'Qingtu-${info.version}-install';New-Item -ItemType Directory -Force $dir|Out-Null;$bases=@(${bases.map(url=>"'"+url+"'").join(',')});$parts=@(${parts});foreach($p in $parts){$f=Join-Path $dir $p.Name;if(!(Test-Path $f) -or (Get-FileHash $f -Algorithm SHA512).Hash -ne $p.Hash){Write-Host ('Downloading '+$p.Name);foreach($base in $bases){try{Invoke-WebRequest -UseBasicParsing ($base+$p.Name) -OutFile ($f+'.partial') -TimeoutSec 120;if((Get-Item ($f+'.partial')).Length -eq $p.Size -and (Get-FileHash ($f+'.partial') -Algorithm SHA512).Hash -eq $p.Hash){Move-Item -Force ($f+'.partial') $f;break}}catch{Write-Host 'Trying next source'}}};if((Get-Item $f).Length -ne $p.Size -or (Get-FileHash $f -Algorithm SHA512).Hash -ne $p.Hash){throw 'Part integrity check failed'}};$out=Join-Path $dir '${windows.url}';$s=[IO.File]::Open($out,[IO.FileMode]::Create);try{foreach($p in $parts){$r=[IO.File]::OpenRead((Join-Path $dir $p.Name));try{$r.CopyTo($s)}finally{$r.Dispose()}}}finally{$s.Dispose()};if((Get-FileHash $out -Algorithm SHA512).Hash -ne '${hash}'){throw 'Installer integrity check failed'};Start-Process -FilePath $out`;
  const content=`@echo off\r\npowershell -NoProfile -Command "${ps}"\r\nif errorlevel 1 pause\r\n`;if(content.length>8000)throw new Error('初次安装脚本超出命令长度');
  bootstrap=path.join(outputDir,`Install-Qingtu-${info.version}-Windows.cmd`);await fs.writeFile(bootstrap,content,'ascii');artifacts.push(path.basename(bootstrap));
 }
 if(windows)await fs.writeFile(path.join(outputDir,'SHA256SUMS-Windows.txt'),(await Promise.all(artifacts.map(async name=>createHash('sha256').update(await fs.readFile(path.join(outputDir,name))).digest('hex')+'  '+name))).join('\n')+'\n');
 return {metadata,bootstrap,artifacts};
}
module.exports={splitRelease};
if(require.main===module)splitRelease(process.argv[2],process.argv[3],undefined,{resolveBase:releaseBaseline}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
