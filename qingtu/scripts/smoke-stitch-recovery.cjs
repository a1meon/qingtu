const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-recovery-'));
 try{
  const sharp=(await import('sharp')).default;await sharp({create:{width:400,height:300,channels:4,background:'#7ab8dd80'}}).png().toFile(path.join(root,'input.png'));
  for(const phase of ['early-close','write','gesture','prefill','crop','read']){
   const result=spawnSync(require('electron'),['desktop/stitch-recovery-smoke.cjs'],{env:{...process.env,QINGTU_RECOVERY_ROOT:root,QINGTU_RECOVERY_PHASE:phase},encoding:'utf8',timeout:60000,windowsHide:true});
   if(result.error||result.status!==0){console.error(result.stdout,result.stderr);throw result.error||new Error(result.stdout+'\n'+result.stderr);}
   if(phase==='write')await fs.rename(path.join(root,'input.png'),path.join(root,'moved-original.png'));
  }
  const report=await fs.readFile(path.join(root,'result.json'),'utf8');await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/stitch-recovery-smoke.json',report);console.log(report);
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
