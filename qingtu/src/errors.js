export const messageForUser=error=>{
 const message=String(error?.message||error||'本地处理失败')
  .replace(/^Error invoking remote method '[^']+':\s*/,'')
  .replace(/^Error:\s*/,'');
 if(/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(message))
  return '本地图片处理服务未连接，请重新打开预览或使用桌面版。';
 return message;
};
