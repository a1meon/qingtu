import {adaptivePalette,averageCells} from './png-palette.mjs';
import {indexedPng,pngSizeFloorKB,bandedPng} from './indexed-png.mjs';

// For modest savings preserve full colour and exact alpha. Vary the number of
// RGB levels, measuring the actual encoder, before switching to indexed colour.
async function fitRgb(data,info,target,encodeRgb,check){
 let low=16,high=254,best;
 while(low<=high){
  check();
  const levels=best?Math.floor((low+high)/2):low;
  const table=Uint8Array.from({length:256},(_,v)=>Math.round(Math.round(v*levels/255)*255/levels));
  const pixels=new Uint8Array(data);
  for(let i=0;i<pixels.length;i+=info.channels){
   pixels[i]=table[data[i]];pixels[i+1]=table[data[i+1]];pixels[i+2]=table[data[i+2]];
  }
  const bytes=await encodeRgb(pixels);check();
  if(bytes.length<=target){best=bytes;low=levels+1;if(bytes.length>=target*.995)break;}
  else high=levels-1;
 }
 return best;
}

export async function adaptivePng(data,info,target,{deflate,encodeRgb,losslessBytes,isObsolete}){
 const {width,height}=info;
 const check=()=>{if(isObsolete?.())throw new Error('预览参数已更新');};
 check();
 if(target>=1000&&target<pngSizeFloorKB(width,height)*1000&&target%1000===0)
  throw new Error(`此尺寸的 PNG 大小上限从 ${pngSizeFloorKB(width,height)} KB 起`);
 if(target>=losslessBytes*.3){
  const bytes=await fitRgb(data,info,target,encodeRgb,check);
  if(bytes)return {bytes,encoding:'全彩减色 PNG'};
 }

 let smallest=Infinity;
 async function restoreDetail(best){
  const {tree,grid,colors}=best,{palette,lookup}=tree.at(colors);
  const count=width*height,base=new Uint8Array(count),detail=new Uint8Array(count),rank=new Uint16Array(count);
  const identity=Uint8Array.from(palette,(_,i)=>i);
  // Give priority to source pixels whose replacement reduces visible colour
  // or alpha error most. Restoring them spends bytes on real image detail.
  const premultiplied=palette.map(([r,g,b,a])=>[r*a/255,g*a/255,b*a/255,a]);
  let maximum=0;
  for(let y=0,p=0;y<height;y++)for(let x=0;x<width;x++,p++){
   const i=p*info.channels,a=info.channels===4?data[i+3]:255;
   const old=lookup[tree.indices[Math.floor(y*grid.height/height)*grid.width+Math.floor(x*grid.width/width)]];
   const next=lookup[tree.classify(data,i)];base[p]=old;detail[p]=next;
   if(next===old)continue;
   const from=premultiplied[old],to=premultiplied[next];
   let improvement=0;
   for(let c=0;c<4;c++){
    const v=c===3?a:data[i+c]*a/255;
    improvement+=(v-from[c])**2-(v-to[c])**2;
   }
   rank[p]=Math.min(65535,Math.max(0,Math.round(improvement)));
   maximum=Math.max(maximum,rank[p]);
  }
  let low=1,high=maximum;
  const indices=new Uint8Array(count);
  while(low<=high){
   check();const threshold=Math.floor((low+high)/2);
   for(let p=0;p<count;p++)indices[p]=rank[p]>=threshold?detail[p]:base[p];
   const bytes=await indexedPng(info,palette,indices,identity,width,height,deflate);check();
   if(bytes.length<=target){high=threshold-1;if(bytes.length>best.bytes.length)best={...best,bytes};}
   else low=threshold+1;
   if(best.bytes.length>=target*.995)break;
  }
  return best;
 }
 async function fitGrid(columns,rows,fixedColors){
  check();
  const grid={...info,width:columns,height:rows};
  const pixels=columns===width&&rows===height?data:averageCells(data,info,columns,rows);
  const tree=adaptivePalette(pixels,grid);
  let best,low=Math.min(2,tree.count),high=tree.count,colors=high;
  while(low<=high){
   colors=fixedColors?Math.min(fixedColors,tree.count):colors;
   const {palette,lookup}=tree.at(colors);
   check();
   const bytes=await indexedPng(grid,palette,tree.indices,lookup,width,height,deflate);check();
   smallest=Math.min(smallest,bytes.length);
   if(bytes.length<=target){
    best={bytes,colors};low=colors+1;
    if(bytes.length>=target*.995)break;
   }else high=colors-1;
   if(fixedColors)break;
   colors=bytes.length>target*3?low:Math.floor((low+high)/2);
  }
  if(!fixedColors&&columns===width&&rows===height&&best?.colors===tree.count&&tree.count===256&&best.bytes.length<target*.98){
   const {palette,lookup}=tree.at(tree.count);
   let lower=0,upper=1;
   for(let probe=0;probe<7;probe++){
    check();
    const strength=probe===0?1:(lower+upper)/2;
    const bytes=await indexedPng(grid,palette,tree.diffuse(strength),lookup,width,height,deflate);check();
    if(bytes.length<=target){
     lower=strength;if(bytes.length>best.bytes.length)best={bytes,colors:tree.count};
     if(strength===1||best.bytes.length>=target*.99)break;
    }else upper=strength;
   }
  }
  return best?{...best,tree,grid}:null;
 }

 let columns=width,rows=height;
 while(true){
  if(columns*rows<=1)break;
  let best=await fitGrid(columns,rows);
  if(best){
   let simplified=columns!==width||rows!==height;
   // When bit depth jumps (2 to 3 colours, for example), a slightly finer
   // palette at a coarser detail grid can use the remaining budget.
   if(best.bytes.length<target*.985&&best.colors<256){
    const colors=Math.max(8,best.colors+1);
    let low=0,high=1;
    for(let probe=0;probe<9;probe++){
     const scale=(low+high)/2;
     const next=await fitGrid(Math.max(1,Math.round(columns*scale)),Math.max(1,Math.round(rows*scale)),colors);
     if(next){
      low=scale;
      if(next.bytes.length>best.bytes.length){best=next;simplified=true;}
      if(best.bytes.length>=target*.99)break;
     }else high=scale;
    }
   }
   if((columns!==width||rows!==height)&&best.bytes.length<target*.99){
    let low=1,high=2;
    for(let probe=0;probe<8;probe++){
     const scale=(low+high)/2;
     const next=await fitGrid(Math.min(width,Math.round(columns*scale)),Math.min(height,Math.round(rows*scale)),best.colors);
     if(next){
      low=scale;if(next.bytes.length>best.bytes.length)best=next;
      if(best.bytes.length>=target*.99)break;
     }else high=scale;
    }
   }
   if(simplified&&best.bytes.length<target*.99&&width*height<=8000000)best=await restoreDetail(best);
   if(!simplified&&best.colors===256&&best.bytes.length<target*.97&&target<losslessBytes*.3){
    const rgb=await fitRgb(data,info,target,encodeRgb,check);
    if(rgb&&rgb.length>best.bytes.length)return {bytes:rgb,encoding:'全彩减色 PNG'};
   }
   return {bytes:best.bytes,encoding:simplified?'简化细节 PNG':'自适应调色板 PNG'};
  }
  columns=Math.ceil(columns/2);rows=Math.ceil(rows/2);
 }
 const grid=height>=2?[1,2]:[Math.min(width,2),1];
 const cells=averageCells(data,info,...grid);
 const colors=Array.from({length:2},(_,i)=>{
  const offset=Math.min(i,grid[0]*grid[1]-1)*info.channels;
  return [cells[offset],cells[offset+1],cells[offset+2],info.channels===4?cells[offset+3]:255];
 });
 check();
 const compact=await bandedPng(width,height,colors);check();
 if(compact.length<=target)return {bytes:compact,encoding:'简化细节 PNG'};
 smallest=Math.min(smallest,compact.length);
 throw new Error(`此画布的 PNG 大小上限可设为 ${Math.max(pngSizeFloorKB(width,height),Math.ceil(smallest/1000))} KB 起`);
}
