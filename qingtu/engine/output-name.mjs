export function exportStem({name,canvas,renamed,output}){
  const ext=output.format==='jpeg'?'jpg':output.format;
  let value=canvas?String(name||'图像'):renamed?name.replace(/\.(?:jpe?g|png|webp|avif|tiff?)$/i,''):name.slice(0,name.lastIndexOf('.')>0?name.lastIndexOf('.'):name.length);
  if(canvas&&value.toLowerCase().endsWith('.'+ext))value=value.slice(0,-ext.length-1);
  let stem=value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120).replace(/[. ]+$/g,'')||(canvas?'图像':'image');
  if(canvas&&/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;
  return canvas?stem:stem+'-qingtu';
}

export function validateName(name){
  if(typeof name!=='string'||!name.trim()||name.length>200||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/^[. ]+$/.test(name))throw new Error('图片名称须为 1–200 个字符，不能包含路径或特殊字符');
  return name.trim();
}
