import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve('artifacts/stitch-fixtures');await fs.mkdir(root,{recursive:true});
const items=[['01-alpine','alpine-lake',3072,4096],['02-cabin','forest-cabin',3072,4096],['03-coast','coastline',2160,3840],['04-alpine','alpine-lake',2160,3840]];
for(const [name,sample,width,height] of items){const output=path.join(root,name+'.jpg');await sharp(`public/samples/${sample}.jpg`).resize(width,height,{fit:'cover'}).jpeg({quality:95}).toFile(output);console.log(output);}
