import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve('artifacts/character-fixtures');await fs.mkdir(root,{recursive:true});
const files=[];
for(const [name,width,height,label,colour,body,back] of [['01-front-face.png',3072,4096,'FRONT FACE','#d4e8f6',false,false],['02-side-face.png',3072,4096,'SIDE FACE','#e3dfef',false,true],['03-front-body.png',2160,3840,'FRONT BODY','#d7e8e1',true,false],['04-back-body.png',2160,3840,'BACK BODY','#eee2d2',true,true]]){
 const figure=body?`<circle cx="1080" cy="460" r="290" fill="#dc6b64"/><path d="M830 860 Q1080 720 1330 860 L1450 2130 L710 2130Z" fill="${back?'#536e94':'#317faf'}"/><path d="M760 2120 L1060 2120 L1000 3550 L710 3550Z M1100 2120 L1400 2120 L1450 3550 L1160 3550Z" fill="#d1a15a"/><path d="M820 920 L590 1920 M1340 920 L1570 1920" stroke="#317faf" stroke-width="180" stroke-linecap="round"/>`:`<ellipse cx="1536" cy="2050" rx="980" ry="1390" fill="#edc3a5"/><path d="M600 1320 Q600 500 1560 540 Q2450 500 2500 1300 Q1900 820 600 1320" fill="#67564d"/><ellipse cx="${back?'1930':'1180'}" cy="1850" rx="65" ry="90" fill="#344b63"/>${back?'':'<ellipse cx="1910" cy="1850" rx="65" ry="90" fill="#344b63"/>'}<path d="M${back?'1920 2720 Q2170 2780 2330 2690':'1200 2720 Q1540 2900 1900 2720'}" stroke="#b97272" stroke-width="45" fill="none"/>`;
 const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg"><stop stop-color="${colour}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/>${figure}<text x="80" y="${height-70}" font-family="sans-serif" font-size="110" font-weight="bold" fill="#3b536c">${label}</text><rect x="0" y="0" width="100%" height="24" fill="#eb4b51"/></svg>`;
 const file=path.join(root,name);await sharp(Buffer.from(svg)).png().toFile(file);files.push(file);
}
for(const [name,pair] of [['05-combined-faces.png',files.slice(0,2)],['06-combined-bodies.png',files.slice(2)]]){
 const meta=await sharp(pair[0]).metadata();await sharp({create:{width:meta.width*2,height:meta.height,channels:4,background:'#fff'}}).composite(await Promise.all(pair.map(async(file,n)=>({input:await fs.readFile(file),left:n*meta.width,top:0})))).png().toFile(path.join(root,name));
}
console.log('Created four portrait and two combined reproducible diagram fixtures in '+root);
