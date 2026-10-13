import test from 'node:test';
import assert from 'node:assert/strict';
import {messageForUser} from '../src/errors.js';
test('native IPC errors expose only the actionable message, including colons',()=>{
 assert.equal(messageForUser(new Error("Error invoking remote method 'qingtu:call': Error: 当前尺寸无法达到此体积：请缩小分辨率")),'当前尺寸无法达到此体积：请缩小分辨率');
 assert.equal(messageForUser(new Error('文件夹不可写')),'文件夹不可写');
});
test('fetch disconnection is identified as a local service connection error',()=>{
 for(const message of ['Failed to fetch','Load failed','NetworkError when attempting to fetch resource.']){
  const text=messageForUser(new TypeError(message));
  assert.match(text,/本地.*服务.*连接/);
  assert.doesNotMatch(text,/Failed to fetch|Load failed|NetworkError/);
 }
 assert.equal(messageForUser(new Error('无法解析图片文件')),'无法解析图片文件');
});
