import test from 'node:test';
import assert from 'node:assert/strict';
import {cropFromDrag} from '../engine/crop-transform.mjs';
import {imageGeometry} from '../engine/stitch-edits.mjs';

const image={width:100,height:200},rect={x:10,y:20,width:50,height:100};
const edit={edges:{left:0,right:0,top:0,bottom:0},links:{horizontal:false,vertical:false}};
test('each draggable crop edge follows source pixels at the existing scale without touching other edges',()=>{
 for(const [side,dx,dy,position] of [['left',5,0,{x:15,y:20,width:45,height:100}],['right',-5,0,{x:10,y:20,width:45,height:100}],['top',0,5,{x:10,y:25,width:50,height:95}],['bottom',0,-5,{x:10,y:20,width:50,height:95}]]){
  const next=cropFromDrag(image,edit,rect,side,dx,dy);assert.deepEqual(next.edit.edges,{...edit.edges,[side]:10});assert.deepEqual(next.position,position);assert.deepEqual(edit.edges,{left:0,right:0,top:0,bottom:0});
 }
});
test('linked crop dragging moves both edges equally and clamps at one remaining source pixel',()=>{
 const linked={...edit,links:{horizontal:true,vertical:true}};
 const horizontal=cropFromDrag(image,linked,rect,'left',5,80);assert.deepEqual(horizontal.edit.edges,{left:10,right:10,top:0,bottom:0});assert.deepEqual(horizontal.position,{x:15,y:20,width:40,height:100});
 const vertical=cropFromDrag(image,linked,rect,'bottom',80,-5);assert.deepEqual(vertical.edit.edges,{left:0,right:0,top:10,bottom:10});assert.deepEqual(vertical.position,{x:10,y:25,width:50,height:90});
 const limit=cropFromDrag(image,linked,rect,'left',999,0);assert.equal(imageGeometry(image,limit.edit).width,2);assert.ok(limit.position.width>0);
});
test('outward drags restore only available source content and preserve nonuniform scales and the opposite cut',()=>{
 const cut={edges:{left:20,right:30,top:40,bottom:50},links:{horizontal:false,vertical:false}},pose={x:100,y:-10,width:100,height:55};
 const outward=cropFromDrag(image,cut,pose,'left',-1000,0);assert.deepEqual(outward.edit.edges,{...cut.edges,left:0});assert.deepEqual(outward.position,{x:60,y:-10,width:140,height:55});
 const inward=cropFromDrag(image,cut,pose,'right',-1000,0);assert.equal(inward.edit.edges.right,79);assert.equal(imageGeometry(image,inward.edit).width,1);assert.deepEqual(inward.position,{x:100,y:-10,width:2,height:55});
 assert.throws(()=>cropFromDrag(image,cut,{...pose,width:0},'top',0,2),/裁剪位置/);
});
test('split source windows crop in piece pixels and missing linkage defaults to independent vertical cropping',()=>{
 const piece={...image,source:{left:100,top:0,width:100,height:200,fullWidth:400,fullHeight:200}};
 const next=cropFromDrag(piece,undefined,rect,'top',0,15);assert.deepEqual(next.edit.edges,{left:0,right:0,top:30,bottom:0});assert.deepEqual(next.edit.links,{horizontal:true,vertical:false});assert.equal(next.position.height,85);assert.equal(next.position.y,35);assert.equal(piece.source.left,100);
});
