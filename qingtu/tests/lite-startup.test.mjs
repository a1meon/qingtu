import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startNativeClient} from '../src/lite/startup.mjs';

const globals={NL_PORT:49152,NL_TOKEN:'access.connect',NL_OS:'Windows',NL_PATH:'C:/Users/测试/轻图'};
function client({ready=true,fail=false}={}) {
 const listeners=new Map(),calls=[];
 return {calls,events:{on(name,fn){calls.push('listen');listeners.set(name,fn);return Promise.resolve();},off(name,fn){if(listeners.get(name)===fn)listeners.delete(name);return Promise.resolve();}},init(){calls.push('init');if(fail)throw new Error('socket failed');if(ready)listeners.get('ready')?.();}};
}
test('startup subscribes before init even when ready is synchronous',{timeout:100},async()=>{
 const n=client();await startNativeClient(n,globals);assert.deepEqual(n.calls,['listen','init']);
});
test('missing port or token never constructs an undefined WebSocket URL',{timeout:100},async()=>{
 for(const scope of [{},{...globals,NL_PORT:undefined},{...globals,NL_TOKEN:''},{...globals,NL_PORT:0},{...globals,NL_TOKEN:'access.'}]) {
  const n=client();await assert.rejects(startNativeClient(n,scope),/启动配置/);assert.deepEqual(n.calls,[]);
 }
});
test('connection failures and a stalled handshake produce bounded startup failures',{timeout:100},async()=>{
 await assert.rejects(startNativeClient(client({fail:true}),globals),/socket failed/);
 await assert.rejects(startNativeClient(client({ready:false}),globals,{timeoutMs:10}),/连接超时/);
});
test('refresh retains the official client same-origin session token without requesting it again',async()=>{
 const n=client();await startNativeClient(n,{...globals,NL_TOKEN:'',sessionStorage:{getItem:key=>{assert.equal(key,'NL_TOKEN');return 'access.connect';}}});assert.deepEqual(n.calls,['listen','init']);
 await assert.rejects(startNativeClient(client(),{...globals,NL_TOKEN:'',sessionStorage:{getItem(){throw new Error('blocked');}}}),/启动配置/);
});
test('lite entry loads same-origin globals before modules and disables native asynchronous injection',async()=>{
 const config=(await import('../vite.lite.config.mjs')).default;
 const plugin=config.plugins.find(p=>p?.name==='lite-entry');
 const html=plugin.transformIndexHtml.handler(await fs.readFile('index.html','utf8'));
 const scripts=[...html.matchAll(/<script\b[^>]*>/g)].map(m=>m[0]);
 assert.match(scripts[0],/src="\/__neutralino_globals\.js"/);
 assert.doesNotMatch(scripts[0],/async|defer|type="module"/);
 assert.match(html,/script-src 'self' 'wasm-unsafe-eval'/);
 assert.doesNotMatch(html,/unsafe-inline[^;]*script|script-src[^;]*unsafe-inline/);
 const pack=await fs.readFile('scripts/pack-lite.mjs','utf8');
 assert.match(pack,/injectGlobals:false/);assert.match(pack,/tokenSecurity:'one-time'/);assert.match(pack,/exportAuthInfo:false/);
});
