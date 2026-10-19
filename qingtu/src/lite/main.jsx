import * as N from '@neutralinojs/lib';
import {initialize} from './bridge.mjs';
import {initializeUpdater} from './updater.mjs';
import {showStartupFailure} from './startup-error.mjs';
try{
 const context=await initialize();initializeUpdater(context);await import('../main.jsx');
 if(globalThis.NL_ARGS?.includes('--qingtu-smoke')){const {smoke}=await import('./smoke.mjs');await smoke(context);}
}catch(error){showStartupFailure(error);if(globalThis.NL_ARGS?.includes('--qingtu-smoke')){await N.filesystem.writeFile(globalThis.NL_PATH+'/smoke-report.json',JSON.stringify({error:error.stack}));await N.app.exit(1);}}
