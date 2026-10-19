export function showStartupFailure(error,document=globalThis.document) {
 let root=document.getElementById('root');
 // The native client may already have replaced the body on a socket error.
 if(!root){root=document.createElement('div');root.id='root';document.body.replaceChildren(root);}
 const message=document.createElement('p');message.textContent='轻图启动失败：'+error.message;
 const recovery=document.createElement('p');recovery.textContent='请关闭轻图并覆盖安装最新修复版，无需卸载。Windows 若无法关闭，可在任务管理器结束“轻图”后安装。';
 const link=document.createElement('a');link.href='https://gitee.com/a1meon_admin/halframe-releases/releases';link.textContent='下载最新修复版';link.target='_blank';link.rel='noopener noreferrer';
 root.replaceChildren(message,recovery,link);
}
