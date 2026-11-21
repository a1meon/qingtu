import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFileSize,sizeChangeLabel} from '../src/export-format.js';

test('compression sizes use decimal units and the same precision on either side of the comparison',()=>{
 assert.equal(formatFileSize(0),'0 B');
 assert.equal(formatFileSize(999),'999 B');
 assert.equal(formatFileSize(1000),'1.00 KB');
 assert.equal(formatFileSize(671221),'671.22 KB');
 assert.equal(formatFileSize(1000000),'1.00 MB');
 assert.equal(formatFileSize(2486444),'2.49 MB');
});

test('compression compares actual bytes and explains changes hidden by rounding',()=>{
 assert.equal(sizeChangeLabel(671221,2486444),'体积增加');
 assert.equal(sizeChangeLabel(2486444,671221),'体积减少');
 assert.equal(sizeChangeLabel(671221,671221),'体积不变');
 assert.equal(sizeChangeLabel(2486444,2486445),'体积增加 1 B');
 assert.equal(sizeChangeLabel(671221,671220),'体积减少 1 B');
});
