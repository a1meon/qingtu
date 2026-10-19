import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='sharp'&&context.parentURL?.includes('/engine/'))return {url:new URL('../src/lite/sharp.mjs',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
