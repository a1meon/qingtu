import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFileSize,sizeChangeLabel,sizeIncreaseHint} from '../src/export-format.js';

test('compression sizes use decimal units and the same precision on either side of the comparison',()=>{
 assert.equal(formatFileSize(0),'0 B');
 assert.equal(formatFileSize(999),'999 B');
 assert.equal(formatFileSize(1000),'1.00 KB');
 assert.equal(formatFileSize(671221),'671.22 KB');
 assert.equal(formatFileSize(1000000),'1.00 MB');
 assert.equal(formatFileSize(2486444),'2.49 MB');
});

test('compression compares actual bytes and explains changes hidden by rounding',()=>{
 assert.equal(sizeChangeLabel(671221,2486444),'增加');
 assert.equal(sizeChangeLabel(2486444,671221),'减少');
 assert.equal(sizeChangeLabel(671221,671221),'不变');
 assert.equal(sizeChangeLabel(2486444,2486445),'增加 1 B');
 assert.equal(sizeChangeLabel(671221,671220),'减少 1 B');
});

test('size explanations follow the actual formats, source pixels and shared assets',()=>{
 const source={assetId:'a',width:320,height:100,format:'jpeg'},output={width:320,height:100,format:'png'};
 assert.match(sizeIncreaseHint([source],output),/JPG 转为 PNG/);
 assert.doesNotMatch(sizeIncreaseHint([source],output),/像素尺寸|拼接/);
 assert.match(sizeIncreaseHint([{...source,format:undefined}],{...output,sourceFormats:['jpeg']}),/JPG 转为 PNG/);
 assert.match(sizeIncreaseHint([source],{...output,width:640,height:200}),/像素增多、JPG 转为 PNG/);
 assert.match(sizeIncreaseHint([source],{...output,width:160,height:50}),/尺寸缩小、JPG 转为 PNG/);
 assert.match(sizeIncreaseHint([source,{...source,assetId:'b'}],output),/2 张原图.*拼接/);
 assert.match(sizeIncreaseHint([source,source],output),/2 个图层合成/);
 assert.match(sizeIncreaseHint([source],{...output,format:'jpeg'}),/重新编码.*JPG 压缩设置/);
});
