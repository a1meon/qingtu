import test from 'node:test';
import assert from 'node:assert/strict';
import {snapResizeRect} from '../engine/transform-snap.mjs';

const frame={x:0,y:0,width:200,height:100,edgesOnly:true},rect={x:0,y:0,width:100,height:50};
test('resize aligns moving edges to target edges and centres while retaining aspect and opposite anchors',()=>{
 const next=snapResizeRect(rect,'e',98,0,[frame],8);
 assert.equal(next.width,200);assert.equal(next.height,100);assert.equal(next.x,0);assert.equal(next.y+next.height/2,25);assert.deepEqual(next.guides,[{axis:'x',value:200}]);
 const centre=snapResizeRect(rect,'e',247,0,[{x:300,y:300,width:100,height:100}],8);
 assert.equal(centre.width,350);assert.equal(centre.width/centre.height,2);
 const corner=snapResizeRect({...rect,x:10,y:20},'nw',-98,-49,[{x:-90,y:-30,width:200,height:100,edgesOnly:true}],8);
 assert.equal(corner.width,200);assert.equal(corner.x+corner.width,110);assert.equal(corner.y+corner.height,70);
});
test('Shift snapping changes dimensions independently and does not snap stationary edges',()=>{
 const next=snapResizeRect(rect,'se',98,29,[{...frame,height:80}],8,true);
 assert.equal(next.width,200);assert.equal(next.height,80);assert.equal(next.guides.length,2);
 const free=snapResizeRect(rect,'e',40,0,[frame],8);
 assert.equal(free.width,140);assert.equal(free.guides.length,0);
 const departing=snapResizeRect(rect,'se',-20,-10,[rect],8);
 assert.equal(departing.width,80);assert.equal(departing.height,40);assert.equal(departing.guides.length,0,'image centre must not trap a moving corner');
 const minimum=snapResizeRect(rect,'nw',10000,10000,[frame],8);
 assert.ok(minimum.width>=1&&minimum.height>=1);
});
