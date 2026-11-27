import test from 'node:test';
import assert from 'node:assert/strict';
import {allowsLocalRequest} from '../scripts/dev-bridge.mjs';

test('the development service accepts same-origin loopback POSTs',()=>{
 const allowed=(method,origin,host)=>allowsLocalRequest({method,headers:{origin,host}});
 assert.equal(allowed('POST','http://127.0.0.1:5173','127.0.0.1:5173'),true);
 assert.equal(allowed('POST','http://localhost:5173','localhost:5174'),false);
 assert.equal(allowed('POST','http://example.test','example.test'),false);
 assert.equal(allowed('POST',undefined,'localhost:5173'),false);
 assert.equal(allowed('GET','http://localhost:5173','localhost:5173'),false);
});
