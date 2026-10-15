// Display sizes at actual import, independent of later crop, zoom or canvas
// changes. Missing legacy entries remain unknown rather than capturing zooms.
export function validateImportSizes(project){
 if(project.importSizes===undefined)return;
 const sizes=project.importSizes,ids=new Set(project.images.map(image=>image.id));
 if(!sizes||typeof sizes!=='object'||Array.isArray(sizes))throw new Error('导入尺寸记录无效');
 for(const [id,size] of Object.entries(sizes))if(!ids.has(id)||!size||Object.keys(size).some(key=>!['width','height'].includes(key))||![size.width,size.height].every(value=>Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER/4))throw new Error('导入尺寸记录无效');
}
export function recordImportSizes(project,images){
 if(project.canvasMode!=='fixed'||!images.length)return project;
 const importSizes={...project.importSizes};
 for(const image of images){const {width,height}=project.positions[image.id];importSizes[image.id]={width,height};}
 const next={...project,importSizes};validateImportSizes(next);return next;
}
export function removeImportSize(sizes,id){if(sizes===undefined)return undefined;const next={...sizes};delete next[id];return next;}
export function splitImportSize(sizes,id,ids,axis,fraction){
 if(sizes===undefined)return undefined;
 const next=removeImportSize(sizes,id),size=sizes[id];if(!size)return next;
 next[ids[0]]={width:axis==='x'?size.width*fraction:size.width,height:axis==='y'?size.height*fraction:size.height};
 next[ids[1]]={width:axis==='x'?size.width-next[ids[0]].width:size.width,height:axis==='y'?size.height-next[ids[0]].height:size.height};
 return next;
}
