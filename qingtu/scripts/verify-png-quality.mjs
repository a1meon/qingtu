import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {encodeFaithfulPng,boundedPixels,pixelDifference} from '../engine/png-quality.mjs';
const root=path.resolve('artifacts/quality');await fs.mkdir(root,{recursive:true});
const report=[];
const svg=(body,width=1600,height=900)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
const fixtures=[
 ['photo',await fs.readFile('public/samples/alpine-lake.jpg')],
 ['gradient',await sharp(svg('<defs><linearGradient id="g"><stop stop-color="#17294f"/><stop offset="1" stop-color="#ffd4ae"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/>')).png().toBuffer()],
 ['text',await sharp(svg('<rect width="1600" height="900" fill="#fff"/><text x="80" y="180" font-size="88" fill="#174e88">Qingtu 轻图 · 0123456789</text><path d="M80 240H1520M80 242H1520" stroke="#222"/><text x="80" y="340" font-size="24">PNG RGB alpha: sharp edges and small text</text>')).png().toBuffer()],
 ['transparent',await sharp(svg('<defs><radialGradient id="g"><stop stop-color="#318acb"/><stop offset="1" stop-color="#318acb" stop-opacity="0"/></radialGradient></defs><circle cx="800" cy="450" r="400" fill="url(#g)"/><text x="350" y="470" font-size="80" fill="#fff">TRANSPARENT</text>')).png().toBuffer()]
];
const width=1600,height=900,data=Buffer.alloc(width*height*3);let seed=17;
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[(y*width+x)*3+c]=Math.min(255,Math.max(0,80+c*35+Math.round(25*Math.sin(x/31)*Math.cos(y/27))+(seed>>>28)-8));}
fixtures.push(['texture',await sharp(data,{raw:{width,height,channels:3}}).png({compressionLevel:0}).toBuffer()]);
if(process.argv[2])fixtures.push(['attachment',await fs.readFile(process.argv[2])]);
for(const [name,source] of fixtures){
 console.log('Comparing '+name);
 const {data,info}=await sharp(source).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const raw={width:info.width,height:info.height,channels:info.channels};
 const full=await sharp(data,{raw}).png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const strongest=await sharp(boundedPixels(data,info,100),{raw}).png({palette:false,compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const target=name==='attachment'?10000000:Math.floor((full.length+strongest.length)/2);
 const entry={name,width:info.width,height:info.height,sourceBytes:source.length,fullColourBytes:full.length,strongestBytes:strongest.length,targetBytes:target};
 const start=performance.now();let result;
 try{result=await encodeFaithfulPng(data,info,target);entry.resultBytes=result.buffer.length;entry.lossless=result.lossless;entry.difference=result.difference;entry.encoding=result.encoding;await fs.writeFile(path.join(root,name+'-result.png'),result.buffer);}
 catch(error){entry.error=error.message;result={buffer:strongest};entry.strongestDifference=pixelDifference(data,await sharp(strongest).raw().toBuffer(),info.channels);await fs.writeFile(path.join(root,name+'-candidate.png'),strongest);}
 entry.elapsedMs=Math.round(performance.now()-start);
 await fs.writeFile(path.join(root,name+'-lossless.png'),full);
 const old=await sharp(data,{raw}).png({palette:true,colours:256,quality:100,dither:0,compressionLevel:9}).toBuffer();
 entry.oldPaletteBytes=old.length;entry.oldPaletteDifference=pixelDifference(data,await sharp(old).ensureAlpha().raw().toBuffer(),4);
 await fs.writeFile(path.join(root,name+'-old-palette.png'),old);
 const crop={left:Math.floor(info.width*.42),top:Math.floor(info.height*.3),width:Math.min(512,Math.floor(info.width*.5)),height:Math.min(384,Math.floor(info.height*.5))};
 const crops=[];let column=0;for(const [buffer,label] of [[source,'Original'],[result.buffer,'Full-colour candidate'],[old,'Old 256-colour']]){
  const bytes=await sharp(buffer).rotate().extract(crop).ensureAlpha().png().toBuffer();
  crops.push({input:bytes,left:column*crop.width,top:32});
  crops.push({input:svg(`<text x="12" y="23" font-size="16" fill="#223344">${label}</text>`,crop.width,32),left:column*crop.width,top:0});column++;
 }
 // Every crop is displayed at 1 source pixel per output pixel.
 await sharp({create:{width:crop.width*3,height:crop.height+32,channels:4,background:'#eee'}}).composite(crops).png().toFile(path.join(root,name+'-100pct.png'));
 report.push(entry);await fs.writeFile(path.join(root,'report.json'),JSON.stringify({algorithm:'Full-colour bounded RGB error <= 2/255; alpha exact; flat/ramp/strong-edge pixels exact',fixtures:report},null,2));
 console.log(JSON.stringify(entry));
}
