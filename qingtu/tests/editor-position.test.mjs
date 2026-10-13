import test from 'node:test';
import assert from 'node:assert/strict';
import {editorPosition} from '../src/stitch/editor-position.js';

test('editor opens at the double-click point and clamps only when it would leave the viewport',()=>{
 const size={width:240,height:268},viewport={width:1280,height:820};
 assert.deepEqual(editorPosition({x:450,y:300},size,viewport),{left:450,top:300});
 assert.deepEqual(editorPosition({x:1250,y:800},size,viewport),{left:1032,top:544});
 assert.deepEqual(editorPosition({x:-20,y:0},size,viewport),{left:8,top:8});
 assert.deepEqual(editorPosition({x:1000,y:700},size,{width:960,height:650}),{left:712,top:374});
});
