import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';

// Packaging only: keep the generated artwork and transparency unchanged.
const source=fileURLToPath(new URL('../build/source/app-icon-blue.png',import.meta.url));
const output=new URL('../build/',import.meta.url);
const sizes=[16,32,48,64,128,256,512,1024];
const pngs=new Map(await Promise.all(sizes.map(async size=>[size,await sharp(source).resize(size,size,{fit:'contain',background:'#00000000'}).png().toBuffer()])));
await fs.writeFile(new URL('icon.png',output),pngs.get(1024));
const icoSizes=[16,32,48,64,128,256];
const header=Buffer.alloc(6+icoSizes.length*16);
header.writeUInt16LE(1,2);header.writeUInt16LE(icoSizes.length,4);
let offset=header.length;
icoSizes.forEach((size,index)=>{
 const entry=6+index*16,bytes=pngs.get(size);
 header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;
 header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
 header.writeUInt32LE(bytes.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=bytes.length;
});
await fs.writeFile(new URL('icon.ico',output),Buffer.concat([header,...icoSizes.map(size=>pngs.get(size))]));
const types={16:'icp4',32:'icp5',64:'icp6',128:'ic07',256:'ic08',512:'ic09',1024:'ic10'};
const chunks=Object.entries(types).map(([size,type])=>{
 const bytes=pngs.get(Number(size)),chunk=Buffer.alloc(8);chunk.write(type);chunk.writeUInt32BE(bytes.length+8,4);
 return Buffer.concat([chunk,bytes]);
});
const icns=Buffer.alloc(8);icns.write('icns');icns.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);
await fs.writeFile(new URL('icon.icns',output),Buffer.concat([icns,...chunks]));
const publicIcon=new URL('../public/assets/app-icon.png',import.meta.url);
await fs.writeFile(publicIcon,await sharp(source).resize(192,192).png().toBuffer());
console.log('Prepared transparent PNG, macOS ICNS, Windows ICO and browser icon.');
