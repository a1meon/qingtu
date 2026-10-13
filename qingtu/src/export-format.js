export const outputFormats=[{value:'jpeg',label:'JPG'},{value:'png',label:'PNG'}];
export const explicitFormat=format=>format==='jpeg'?'jpeg':'png';
export const megabytes=bytes=>`${(bytes/1000000).toFixed(2)} MB`;
