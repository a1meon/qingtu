import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCanvasName,nameOrDefault,sourceStem} from '../engine/output-name.mjs';
import {canvasName} from '../src/stitch/names.js';
test('user canvas names remain literal in the title, cards, export choices and dialogs',()=>{
 for(const name of ['画布 12','拼图3','我的成片.v1.2','封面 A'])assert.equal(canvasName(name),name);
});

test('blank names recover the creation name and older canvases use the earliest available source',()=>{
 const images=[{id:'second',name:'封面.png'},{id:'first',name:'原图.v2.jpg'}],project={images,initialOrder:['first','second']};
 assert.equal(sourceStem('　.png','图像 3'),'图像 3');
 assert.equal(nameOrDefault('　 ',defaultCanvasName({...project,defaultName:'图像 2'})),'图像 2');
 assert.equal(defaultCanvasName({...project,name:'图像 4'}),'图像 4');
 assert.equal(defaultCanvasName(project),'原图.v2');
 assert.equal(defaultCanvasName({images:[]}),'图像');
 assert.equal(nameOrDefault(' 封面 A ','图像 1'),' 封面 A ');
});
