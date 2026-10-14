import test from 'node:test';
import assert from 'node:assert/strict';
import {RESIZE_HANDLES,resizeImageRect} from '../engine/canvas-transform.mjs';

test('every resize handle preserves proportions by default and fixes its opposite anchor',()=>{
 const rect={x:-20,y:10,width:200,height:100};
 for(const handle of RESIZE_HANDLES){
  const next=resizeImageRect(rect,handle,40,30);
  assert.equal(next.width/next.height,2);
  if(handle.includes('w'))assert.equal(next.x+next.width,rect.x+rect.width);
  if(handle.includes('e'))assert.equal(next.x,rect.x);
  if(handle.includes('n'))assert.equal(next.y+next.height,rect.y+rect.height);
  if(handle.includes('s'))assert.equal(next.y,rect.y);
  if(handle==='n'||handle==='s')assert.equal(next.x+next.width/2,rect.x+rect.width/2);
  if(handle==='w'||handle==='e')assert.equal(next.y+next.height/2,rect.y+rect.height/2);
 }
});

test('Shift resizes axes independently and releasing it preserves the current rectangle ratio',()=>{
 const rect={x:10,y:20,width:200,height:100};
 const stretched=resizeImageRect(rect,'se',50,0,true);
 assert.deepEqual(stretched,{x:10,y:20,width:250,height:100});
 assert.deepEqual(resizeImageRect(stretched,'se',50,0),{x:10,y:20,width:300,height:120});
 assert.deepEqual(resizeImageRect(rect,'nw',25,20,true),{x:35,y:40,width:175,height:80});
});

test('shrinking cannot invert an image or produce zero pixels; off-canvas coordinates stay free',()=>{
 const rect={x:-300,y:400,width:200,height:100};
 const next=resizeImageRect(rect,'se',-1000,-1000);
 assert.equal(next.width,2);assert.equal(next.height,1);assert.equal(next.x,-300);assert.equal(next.y,400);
 assert.deepEqual(resizeImageRect(rect,'se',-1000,-1000,true),{x:-300,y:400,width:1,height:1});
 assert.throws(()=>resizeImageRect(rect,'bad',10,20),/参数无效/);
});
