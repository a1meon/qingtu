// Indexed PNG uses one palette for the entire image. The index grid may be
// coarser than the output grid when the user allows reducing spatial detail.
const crcTable=Uint32Array.from({length:256},(_,n)=>{
 for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;
 return n>>>0;
});

function pngCrc(bytes){
 let crc=0xffffffff;
 for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
 return ~crc>>>0;
}

function chunk(name,bytes){
 const out=new Uint8Array(bytes.length+12),view=new DataView(out.buffer);
 view.setUint32(0,bytes.length);
 for(let i=0;i<4;i++)out[4+i]=name.charCodeAt(i);
 out.set(bytes,8);
 view.setUint32(out.length-4,pngCrc(out.subarray(4,out.length-4)));
 return out;
}

export async function deflatePixels(bytes){
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function indexedPng(grid,palette,indices,lookup,width,height,deflate){
 const depth=palette.length<=2?1:palette.length<=4?2:palette.length<=16?4:8;
 const stride=1+Math.ceil(width*depth/8),rows=new Uint8Array(stride*height);
 const columns=Int32Array.from({length:width},(_,x)=>Math.floor(x*grid.width/width));
 let last=-1;
 for(let y=0;y<height;y++){
  const sourceY=Math.floor(y*grid.height/height),offset=y*stride;
  if(sourceY===last){rows.copyWithin(offset,offset-stride,offset);continue;}
  last=sourceY;
  const start=sourceY*grid.width;
  for(let x=0;x<width;x++){
   const index=lookup[indices[start+columns[x]]],bit=x*depth;
   rows[offset+1+(bit>>>3)]|=index<<(8-depth-(bit&7));
  }
 }
 const header=new Uint8Array(13),view=new DataView(header.buffer);
 view.setUint32(0,width);view.setUint32(4,height);header[8]=depth;header[9]=3;
 const rgb=new Uint8Array(palette.length*3),alpha=new Uint8Array(palette.length);
 let alphaLength=0;
 for(const [i,color] of palette.entries()){
  rgb.set(color.slice(0,3),i*3);alpha[i]=color[3];if(color[3]!==255)alphaLength=i+1;
 }
 const parts=[Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',header),chunk('PLTE',rgb)];
 if(alphaLength)parts.push(chunk('tRNS',alpha.subarray(0,alphaLength)));
 parts.push(chunk('IDAT',await deflate(rows)),chunk('IEND',new Uint8Array()));
 const output=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));
 let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}
 return output;
}

// Logos and screenshots may fit losslessly as an indexed PNG. Stop counting
// immediately on photographs rather than allocating an index raster for them.
export async function exactIndexedPng(data,info,target,deflate){
 const {width,height,channels}=info,count=width*height,entries=new Map(),palette=[];
 function key(i){
  const alpha=channels===4?data[i+3]:255;
  return ((data[i]*256+data[i+1])*256+data[i+2])*256+alpha;
 }
 for(let i=0;i<data.length;i+=channels){
  const color=key(i);
  if(entries.has(color))continue;
  if(palette.length===256)return null;
  entries.set(color,palette.length);
  palette.push([data[i],data[i+1],data[i+2],channels===4?data[i+3]:255]);
 }
 const indices=new Uint8Array(count);
 for(let p=0;p<count;p++)indices[p]=entries.get(key(p*channels));
 const bytes=await indexedPng(info,palette,indices,Uint8Array.from(palette,(_,i)=>i),width,height,deflate);
 return bytes.length<=target?bytes:null;
}

// Even a 1-bit PNG needs a whole number of bytes plus one filter byte per row.
// Each DEFLATE match represents at most 258 bytes using at least two code bits.
export function pngSizeFloorKB(width,height){
 const bytes=(Math.ceil(width/8)+1)*height;
 return Math.max(1,Math.ceil((63+Math.floor(bytes/1032))/1000));
}

const twoIndices=Uint8Array.of(0,1);
export function bandedPng(width,height,colors,deflate=deflatePixels){
 const grid=height>=2?{width:1,height:2}:{width:2,height:1};
 return indexedPng(grid,colors,twoIndices,twoIndices,width,height,deflate);
}

// This last-resort representation contains two source-derived colours. Its
// compressed scanlines depend on dimensions only. Reserve both alpha entries.
const minimums=new Map();
export function practicalPngMinimumKB(width,height){
 const key=width+'x'+height;
 if(!minimums.has(key)){
  const result=bandedPng(width,height,[[0,0,0,0],[255,255,255,128]])
   .then(bytes=>Math.max(1,Math.ceil(bytes.length/1000)));
  minimums.set(key,result);
  if(minimums.size>24)minimums.delete(minimums.keys().next().value);
  result.catch(()=>minimums.delete(key));
 }
 return minimums.get(key);
}
