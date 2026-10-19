// The blocking same-origin globals script must finish before the client opens
// its socket. Do not recover by requesting it again: the token is one-time.
export async function startNativeClient(N,scope=globalThis,{timeoutMs=10000}={}) {
 let token=scope.NL_TOKEN;
 // A refresh gets fresh globals but an empty one-time token. The official
 // client retains this runtime's token in same-origin sessionStorage.
 if(!token)try{token=scope.sessionStorage?.getItem('NL_TOKEN');}catch{}
 if(!Number.isInteger(scope.NL_PORT)||scope.NL_PORT<1||scope.NL_PORT>65535||
    typeof token!=='string'||!token.split('.')[1]||
    !scope.NL_OS||!scope.NL_PATH)throw new Error('启动配置未能加载，请关闭后重新打开；仍失败时请覆盖安装最新修复版');
 await new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{
   if(settled)return;settled=true;clearTimeout(timer);
   N.events.off('ready',ready).catch(()=>{});
   error?reject(error):resolve();
  };
  const ready=()=>finish();
  const timer=setTimeout(()=>finish(new Error('本机服务连接超时，请关闭后重新打开轻图')),timeoutMs);
  Promise.resolve(N.events.on('ready',ready)).then(()=>{if(!settled)N.init();}).catch(finish);
 });
}
