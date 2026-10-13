import test from 'node:test';
import assert from 'node:assert/strict';
import {appendProjectImages,removeProjectImage,resetProject,knownImportOrder,recordImportOrder} from '../engine/stitch-reset.mjs';
import {moveImage} from '../engine/stitch-layout.mjs';

const a={id:'a',width:120,height:100},b={id:'b',width:80,height:100},c={id:'c',width:50,height:100};
const project=()=>({images:[],initialOrder:[],layout:'horizontal',grid:{rows:2,columns:2},positions:{},edits:{},export:{format:'png',longEdge:1200,targetBytes:10000000}});
test('append, reorder, delete and reset preserve chronological import order, not names',()=>{
 let p=appendProjectImages(project(),[a,b]);p={...p,images:moveImage(p.images,'b','a')};p=appendProjectImages(p,[c]);
 assert.deepEqual(p.images.map(i=>i.id),['b','a','c']);assert.deepEqual(p.initialOrder,['a','b','c']);
 p.edits={a:{axis:'horizontal',amount:10},b:{axis:'vertical',amount:5}};
 const reset=resetProject(p);assert.deepEqual(reset.images,[a,b,c]);assert.deepEqual(reset.edits,{});assert.deepEqual(reset.export,p.export);assert.deepEqual(reset.grid,p.grid);assert.equal(reset.layout,'horizontal');assert.deepEqual(p.images.map(i=>i.id),['b','a','c']);assert.equal(p.edits.a.amount,10);
 const removed=removeProjectImage(p,'a');assert.deepEqual(removed.initialOrder,['b','c']);assert.deepEqual(resetProject(removed).images,[b,c]);assert.equal(removed.edits.a,undefined);
});
test('free reset restores full sources at the same scale and centre, retaining positions and export settings',()=>{
 const p={...project(),images:[b,a],initialOrder:['a','b'],layout:'free',positions:{a:{x:-10,y:40,width:200},b:{x:210,y:50,width:80}},edits:{a:{axis:'horizontal',amount:10}}};
 const r=resetProject(p);assert.deepEqual(r.images,[a,b]);assert.deepEqual(r.positions.a,{x:-30,y:40,width:240});assert.deepEqual(r.positions.b,p.positions.b);assert.equal(r.layout,'free');assert.deepEqual(r.export,p.export);assert.deepEqual(r.edits,{});
 const added=appendProjectImages(r,[c]);assert.deepEqual(added.initialOrder,['a','b','c']);assert.equal(added.positions.c.width,100);assert.equal(added.positions.c.x,290);
});
test('legacy order remains unknown until explicitly supplied and failed reset is atomic',()=>{
 const p={...project(),images:[b,a],edits:{a:{axis:'horizontal',fraction:.1}}};delete p.initialOrder;
 assert.equal(knownImportOrder(p),undefined);assert.throws(()=>resetProject(p),/真实顺序/);assert.deepEqual(p.images,[b,a]);assert.equal(p.edits.a.fraction,.1);
 const added=appendProjectImages(p,[c]);assert.equal(added.initialOrder,undefined);
 const recorded=recordImportOrder(p,['a','b']);assert.deepEqual(resetProject(recorded).images,[a,b]);assert.equal(recorded.images[0],b);
 assert.deepEqual(knownImportOrder({...p,images:[a]}),['a']);assert.deepEqual(knownImportOrder({...p,images:[]}),[]);
 for(const order of [['b','b'],['a'],['a','outside']])assert.throws(()=>recordImportOrder(p,order),/顺序/);
});
