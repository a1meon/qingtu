import { crc32 } from 'node:zlib';

// Prefer valid container metadata. For gaps too small for a chunk, use neutral
// trailing bytes, which JPEG/PNG/WebP decoders ignore. WebP chunks are even-sized.
export function padToExactSize(source, target, format){
  const gap=target-source.length;
  if(gap<0)throw new Error('图片体积超过目标');
  if(!gap)return source;
  if(format==='jpeg' && gap>=4){
    const padding=Buffer.alloc(gap);let pos=0;
    while(pos<gap){
      let size=Math.min(65537,gap-pos);
      if(gap-pos-size>0 && gap-pos-size<4)size-=4;
      padding[pos]=0xff;padding[pos+1]=0xfe;padding.writeUInt16BE(size-2,pos+2);pos+=size;
    }
    return Buffer.concat([source.subarray(0,2),padding,source.subarray(2)],target);
  }
  if(format==='png' && gap>=12){
    let pos=8;
    while(pos+12<=source.length){
      const length=source.readUInt32BE(pos),type=source.toString('ascii',pos+4,pos+8);
      if(type==='IEND')break;
      pos+=length+12;
    }
    if(pos+12>source.length)throw new Error('PNG 文件结构损坏');
    const chunk=Buffer.alloc(gap);
    chunk.writeUInt32BE(gap-12,0);chunk.write('qtPd',4,'ascii');
    chunk.writeUInt32BE(crc32(chunk.subarray(4,gap-4)),gap-4);
    return Buffer.concat([source.subarray(0,pos),chunk,source.subarray(pos)],target);
  }
  if(format==='webp' && gap>=8){
    const aligned=gap-gap%2;
    const chunk=Buffer.alloc(aligned);chunk.write('JUNK',0,'ascii');chunk.writeUInt32LE(aligned-8,4);
    const result=Buffer.concat([source,chunk,Buffer.alloc(gap%2)],target);
    result.writeUInt32LE(source.length+aligned-8,4);
    return result;
  }
  return Buffer.concat([source,Buffer.alloc(gap)],target);
}
