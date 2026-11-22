export function nameOrDefault(name,fallback='图像'){
  return typeof name==='string'&&name.trim()?name:fallback;
}

export function sourceStem(filename,fallback='图像'){
  if(typeof filename!=='string')return fallback;
  const dot=filename.lastIndexOf('.');
  return nameOrDefault(dot>0?filename.slice(0,dot):filename,fallback);
}

export function defaultCanvasName(project){
  if(typeof project.defaultName==='string'&&project.defaultName.trim())return project.defaultName;
  // Older canvases only recorded their current name and their import order.
  if(/^图像 \d+$/.test(project.name))return project.name;
  const first=project.images?.find(image=>image.id===project.initialOrder?.[0])||project.images?.[0];
  return sourceStem(first?.name);
}

export function compressionRename(name,originalName){
  if(typeof name==='string'&&!name.trim())return {name:originalName,renamed:false};
  return {name:validateName(name),renamed:true};
}

export function exportStem({name,canvas,renamed,output}){
  const ext=output.format==='jpeg'?'jpg':output.format;
  let value=canvas?nameOrDefault(name):renamed?name.replace(/\.(?:jpe?g|png|webp|avif|tiff?)$/i,''):sourceStem(name);
  if(canvas&&value.toLowerCase().endsWith('.'+ext))value=value.slice(0,-ext.length-1);
  let stem=value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120).replace(/[. ]+$/g,'')||(canvas?'图像':'image');
  if(canvas&&/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;
  return canvas?stem:stem+'-qingtu';
}

export function validateName(name){
  if(typeof name!=='string'||!name.trim()||name.length>200||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/^[. ]+$/.test(name))throw new Error('图片名称须为 1–200 个字符，不能包含路径或特殊字符');
  return name.trim();
}
