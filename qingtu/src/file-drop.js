const internalPreview='application/x-qingtu-preview';

export function blockPreviewDrag(event){
 event.preventDefault();
 try{event.dataTransfer?.setData(internalPreview,'1');}catch{}
}
export function isExternalFileTransfer(transfer){
 const types=Array.from(transfer?.types||[]);
 return types.includes('Files')&&!types.includes(internalPreview);
}
