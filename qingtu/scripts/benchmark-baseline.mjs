import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

export async function prepareBenchmarkBaseline(){
 const root=new URL('../artifacts/performance-baseline/',import.meta.url);await fs.mkdir(root,{recursive:true});
 for(const file of ['image.mjs','png-quality.mjs','buffer-cache.mjs']){
  const destination=new URL(file,root);
  try{await fs.access(destination);}catch{await fs.writeFile(destination,execFileSync('git',['show',`698127c:qingtu/engine/${file}`],{cwd:new URL('../',import.meta.url)}));}
 }
}
