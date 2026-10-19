import * as N from '@neutralinojs/lib';
import {initialize} from './bridge.mjs';
import {initializeUpdater} from './updater.mjs';
try{
 const context=await initialize();initializeUpdater(context);await import('../main.jsx');
 if(context.api.platform==='win32')setTimeout(()=>N.window.setDraggableRegion(document.querySelector('.titlebar'),{exclude:[...document.querySelectorAll('.titlebar button')]}).catch(()=>{}),100);
 if(globalThis.NL_ARGS?.includes('--qingtu-smoke')){const {smoke}=await import('./smoke.mjs');await smoke(context);}
}catch(error){document.getElementById('root').textContent='轻图启动失败：'+error.message;if(globalThis.NL_ARGS?.includes('--qingtu-smoke')){await N.filesystem.writeFile(globalThis.NL_PATH+'/smoke-report.json',JSON.stringify({error:error.stack}));await N.app.exit(1);}}
