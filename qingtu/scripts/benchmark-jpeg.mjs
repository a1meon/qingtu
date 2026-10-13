import fs from 'node:fs/promises';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';
import {pixelDifference} from '../engine/png-quality.mjs';
import {prepareBenchmarkBaseline} from './benchmark-baseline.mjs';
await prepareBenchmarkBaseline();
const {processImage:baseline}=await import('../artifacts/performance-baseline/image.mjs');
const photo=await fs.readFile('public/samples/alpine-lake.jpg'),report=[];
const info={width:1000,height:600,channels:3},data=Buffer.alloc(info.width*info.height*3);
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;data[i]=x%2?255:0;data[i+1]=Math.floor(y*255/info.height);data[i+2]=x%2?0:255;}
const lines=await sharp(data,{raw:info}).png().toBuffer();
for(const [name,source,targetBytes,resize] of [['photo-budget',photo,400000,{type:'scale',percent:100}],['enlarged-photo',photo,10000000,{type:'pixels',width:5000,height:2140,locked:false}],['fine-colour-edges',lines,10000000,{type:'scale',percent:100}]]){
 const settings={mode:'smart',format:'jpeg',targetBytes,resize},entry={name,targetBytes};
 const outputs=[];
 for(const [label,encode] of [['baseline',baseline],['optimized',processImage]]){
  const start=performance.now(),result=await encode(source,settings),ms=Math.round(performance.now()-start),actual=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});
  const reference=await sharp(source).resize(result.width,result.height,{fit:'fill'}).toColourspace('srgb').raw().toBuffer();
  entry[label]={ms,bytes:result.buffer.length,quality:result.quality,chromaSubsampling:result.chromaSubsampling,difference:pixelDifference(reference,actual.data,actual.info.channels)};outputs.push(result.buffer);await fs.writeFile(`artifacts/performance/${name}-${label}.jpg`,result.buffer);
 }
 const width=512,height=384,left=name==='enlarged-photo'?2100:Math.min(500,info.width-512),top=name==='enlarged-photo'?650:80;
 const cuts=await Promise.all(outputs.map(buffer=>sharp(buffer).extract({left,top,width,height}).png().toBuffer()));
 await sharp({create:{width:width*2,height,channels:3,background:'#fff'}}).composite(cuts.map((input,n)=>({input,left:n*width,top:0}))).png().toFile(`artifacts/performance/${name}-100pct.png`);
 report.push(entry);console.log(JSON.stringify(entry));
}
await fs.writeFile('artifacts/performance/jpeg.json',JSON.stringify(report,null,2));
