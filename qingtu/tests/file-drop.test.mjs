import test from 'node:test';
import assert from 'node:assert/strict';
import {blockPreviewDrag,isExternalFileTransfer} from '../src/file-drop.js';

test('an internal thumbnail File transfer is rejected even if a browser exposes its PNG as a file',()=>{
 const transfer={types:['Files','text/uri-list'],files:[{name:'image.png',width:160}],setData(type){this.types.push(type);}};
 let cancelled=false;blockPreviewDrag({dataTransfer:transfer,preventDefault(){cancelled=true;}});
 assert.equal(cancelled,true);assert.equal(isExternalFileTransfer(transfer),false);
});
test('external original-file drops are accepted; links, text and cancelled drags do not import',()=>{
 assert.equal(isExternalFileTransfer({types:['Files'],files:[{name:'original.png'}]}),true);
 for(const transfer of [undefined,{types:[]},{types:['text/plain']},{types:['text/uri-list']}])assert.equal(isExternalFileTransfer(transfer),false);
 assert.doesNotThrow(()=>blockPreviewDrag({preventDefault(){},dataTransfer:{setData(){throw new Error('Read-only drag');}}}));
});
