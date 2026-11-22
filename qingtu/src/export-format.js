export const outputFormats=[{value:'jpeg',label:'JPG'},{value:'png',label:'PNG'}];
export const explicitFormat=format=>format==='jpeg'?'jpeg':'png';
export const megabytes=bytes=>`${(bytes/1000000).toFixed(2)} MB`;

export function formatFileSize(bytes){
 if(bytes<1000)return `${bytes} B`;
 if(bytes<1000000)return `${(bytes/1000).toFixed(2)} KB`;
 return megabytes(bytes);
}

export function sizeChangeLabel(before,after){
 if(before===after)return '不变';
 const label=after>before?'增加':'减少';
 if(formatFileSize(before)===formatFileSize(after))return `${label} ${formatFileSize(Math.abs(after-before))}`;
 return label;
}

export function encodingLabel(output){
 if(output.unchanged||output.lossless)return '无损';
 if(/减色|调色板|简化细节/.test(output.encoding))return '减色';
 if(output.encoding?.includes('高保真'))return '高保真';
 if(output.format==='jpeg'&&output.quality>=90)return '高保真';
 return '有损';
}

const formatName=format=>format==='jpeg'?'JPG':format.toUpperCase();

export function sizeIncreaseHint(sources,output){
 const formats=output.sourceFormats??sources.map(image=>image.format);
 const converted=[...new Set(formats.filter(format=>format&&format!==output.format))];
 const conversion=converted.length?`${converted.map(formatName).join('、')} 转为 ${formatName(output.format)}`:'';
 const changes=[];
 if(sources.length>1){
  const originals=new Set(sources.map(image=>image.assetId||image.id)).size;
  changes.push(originals===sources.length?`${originals} 张原图拼接`:`${sources.length} 个图层合成`);
 }else if(sources.length===1){
  const image=sources[0],area=(image.source?.fullWidth??image.width)*(image.source?.fullHeight??image.height);
  const pixels=output.width*output.height;
  if(pixels>area)changes.push('像素增多');
  if(pixels<area)changes.push('尺寸缩小');
 }
 if(conversion)changes.push(conversion);
 return changes.length?`${changes.join('、')}后重新编码，文件可能更大。`:`重新编码时，${formatName(output.format)} 压缩设置会影响体积。`;
}
