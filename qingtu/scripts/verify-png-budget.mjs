import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';
import {pixelDifference} from '../engine/png-quality.mjs';
const directory=path.resolve('artifacts/png-budget');await fs.mkdir(directory,{recursive:true});
const fixtures=[['photo','public/samples/alpine-lake.jpg'],...['texture','gradient','text','transparent'].map(name=>[name,`artifacts/quality/${name}-lossless.png`])];
if(process.argv[2])fixtures.push(['attachment',process.argv[2]]);
const reports=[];
for(const [name,file] of fixtures){
 if(process.env.QINGTU_BUDGET_ONLY&&name!==process.env.QINGTU_BUDGET_ONLY)continue;
 const source=await fs.readFile(file),{data,info}=await sharp(source).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const full=await sharp(data,{raw:info}).png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const target=name==='attachment'?10000000:Math.max(1000,Math.floor(full.length*.65));
 console.log(JSON.stringify({name,start:true,target,requested:[info.width,info.height]}));
 const started=performance.now();
 const encode=targetBytes=>processImage(source,{mode:'smart',format:'png',targetBytes,resize:{type:'scale',percent:100}});
 const limit=target,result=await encode(limit);
 const elapsedMs=Math.round(performance.now()-started),destination=path.join(directory,`${name}.png`);await fs.writeFile(destination,result.buffer);
 const bytes=(await fs.stat(destination)).size,meta=await sharp(destination).metadata();
 if(bytes>limit||meta.format!=='png'||meta.width!==info.width||meta.height!==info.height)throw new Error(`Invalid output: ${name}`);
 const decoded=await sharp(result.buffer).ensureAlpha().raw().toBuffer(),encodingDifference=pixelDifference(data,decoded,4);
 if((result.lossless||result.encoding==='全彩高保真 PNG')&&(encodingDifference.maxError>2||encodingDifference.rmse>1.5||encodingDifference.alphaMaxError!==0))throw new Error(`Quality floor failed: ${name}`);
 const entry={name,sourceBytes:source.length,initialTarget:target,targetBytes:limit,width:meta.width,height:meta.height,bytes,encoding:result.encoding,encodingDifference,elapsedMs};
 const crop={left:name==='text'?50:Math.floor(info.width*.42),top:name==='text'?90:Math.floor(info.height*.3),width:Math.min(512,Math.floor(info.width*.5)),height:Math.min(384,Math.floor(info.height*.5))};
 const images=[];
 for(const [column,pixels,label] of [[0,data,'Original at 100%'],[1,decoded,'Export at 100%']]){
  images.push({input:await sharp(pixels,{raw:info}).extract(crop).png().toBuffer(),left:column*crop.width,top:32});
  const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="32"><text x="10" y="22" font-size="14" fill="#20334e">${label}</text></svg>`);images.push({input:title,left:column*crop.width,top:0});
 }
 await sharp({create:{width:crop.width*2,height:crop.height+32,channels:4,background:'#fff'}}).composite(images).png().toFile(path.join(directory,`${name}-100pct.png`));
 reports.push(entry);console.log(JSON.stringify(entry));await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({algorithm:'Fixed-resolution PNG with measured colour and detail reduction when lossless and bounded-error encoding exceed the requested ceiling.',fixtures:reports},null,2));
}
