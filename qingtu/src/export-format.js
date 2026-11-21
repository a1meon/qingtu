export const outputFormats=[{value:'jpeg',label:'JPG'},{value:'png',label:'PNG'}];
export const explicitFormat=format=>format==='jpeg'?'jpeg':'png';
export const megabytes=bytes=>`${(bytes/1000000).toFixed(2)} MB`;

export function formatFileSize(bytes){
 if(bytes<1000)return `${bytes} B`;
 if(bytes<1000000)return `${(bytes/1000).toFixed(2)} KB`;
 return megabytes(bytes);
}

export function sizeChangeLabel(before,after){
 if(before===after)return '体积不变';
 const label=after>before?'体积增加':'体积减少';
 if(formatFileSize(before)===formatFileSize(after))return `${label} ${formatFileSize(Math.abs(after-before))}`;
 return label;
}
