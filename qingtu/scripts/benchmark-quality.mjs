import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {pixelDifference} from '../engine/png-quality.mjs';
import {prepareBenchmarkBaseline} from './benchmark-baseline.mjs';
const directory=path.resolve('artifacts/performance');await fs.mkdir(directory,{recursive:true});
await prepareBenchmarkBaseline();
const mode=process.argv[2]||'baseline',encoder=await import(mode==='baseline'?'../artifacts/performance-baseline/png-quality.mjs':'../engine/png-quality.mjs');
const reports=JSON.parse(await fs.readFile('artifacts/quality/report.json','utf8')).fixtures;
const cases=[['photo','public/samples/alpine-lake.jpg'],['texture','artifacts/quality/texture-lossless.png']];
if(process.argv[3])cases.push(['attachment',process.argv[3]]);
const report=[];
for(const [name,file] of cases){
 const source=await fs.readFile(file),{data,info}=await sharp(source).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}),target=reports.find(item=>item.name===name)?.targetBytes||10000000;
 const start=performance.now(),entry={name,width:info.width,height:info.height,sourceBytes:source.length,target};
 try{const result=await encoder.encodeFaithfulPng(data,info,target);Object.assign(entry,{bytes:result.buffer.length,difference:result.difference,strength:result.strength});await fs.writeFile(path.join(directory,`${mode}-${name}.png`),result.buffer);}catch(error){entry.error=error.message;}
 entry.elapsedMs=Math.round(performance.now()-start);report.push(entry);console.log(JSON.stringify(entry));
 if(mode==='optimized'&&name==='attachment'){
  const retryStart=performance.now();try{await encoder.encodeFaithfulPng(data,info,target+1000000);}catch(error){entry.retryError=error.message;}
  entry.retryMs=Math.round(performance.now()-retryStart);console.log(JSON.stringify({name,retryMs:entry.retryMs}));
 }
 if(name==='photo'&&mode==='baseline'){
  const jpeg=[];
  for(const chromaSubsampling of ['4:2:0','4:4:4'])for(const mozjpeg of [true,false]){
   const begin=performance.now(),buffer=await sharp(data,{raw:info}).jpeg({quality:90,chromaSubsampling,mozjpeg,optimiseCoding:true}).toBuffer(),decoded=await sharp(buffer).ensureAlpha().raw().toBuffer();
   jpeg.push({chromaSubsampling,mozjpeg,bytes:buffer.length,elapsedMs:Math.round(performance.now()-begin),difference:pixelDifference(data,decoded,4)});
  }
  await fs.writeFile(path.join(directory,'jpeg-options.json'),JSON.stringify(jpeg,null,2));console.log(JSON.stringify({jpeg}));
 }
}
await fs.writeFile(path.join(directory,mode+'.json'),JSON.stringify(report,null,2));
