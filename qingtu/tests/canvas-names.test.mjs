import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasName} from '../src/stitch/names.js';
test('user canvas names remain literal in the title, cards, export choices and dialogs',()=>{
 for(const name of ['画布 12','拼图3','我的成片.v1.2','封面 A'])assert.equal(canvasName(name),name);
});
