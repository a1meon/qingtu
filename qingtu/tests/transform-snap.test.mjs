import test from 'node:test';
import assert from 'node:assert/strict';
import {snapResizeRect,snapCropFromDrag} from '../engine/transform-snap.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';

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
const image={id:'a',width:1000,height:1000},other={id:'b',width:1000,height:1000};
const project={canvasMode:'fixed',heightLocked:true,layout:'horizontal',canvasSizing:'content',canvas:{width:200,height:100},images:[image,other],edits:{},positions:{a:{x:0,y:0,width:100,height:100},b:{x:100,y:0,width:100,height:100}}};
const edit={edges:{left:0,right:0,top:0,bottom:0},links:{horizontal:false,vertical:false}};
test('crop snapping uses the real fixed-height row and keeps the eventual committed canvas identical',()=>{
 const target={x:70,y:300,width:10,height:50,edgesOnly:true};
 const next=snapCropFromDrag(project,'a',edit,project.positions.a,'right',-28,0,[target],3);
 assert.equal(next.edit.edges.right,300);assert.equal(next.position.width,70);assert.deepEqual(next.guides,[{axis:'x',value:70}]);
 const applied=setImageEdit(project,'a',next.edit);assert.deepEqual(applied.positions.a,next.position);assert.deepEqual(applied.canvas,{width:170,height:100});assert.equal(applied.positions.b.x,70);
 const top=snapCropFromDrag(project,'a',edit,project.positions.a,'top',0,19.5,[{x:125,y:300,width:10,height:50,edgesOnly:true}],2);
 assert.equal(top.edit.edges.top,200);assert.equal(top.edit.edges.bottom,0);assert.equal(top.position.width,125);assert.equal(top.position.height,100);
});
test('corner crop snaps source boundaries, obeys independent links and preserves the manual canvas',()=>{
 const cut={edges:{left:20,right:20,top:100,bottom:50},links:{horizontal:true,vertical:false}},p=setImageEdit({...project,canvasSizing:'manual'},'a',cut);
 const result=snapCropFromDrag(p,'a',cut,p.positions.a,'nw',-1,-5,[],3);
 assert.equal(result.edit.edges.left,0);assert.equal(result.edit.edges.right,0);assert.equal(result.edit.edges.top,58);assert.equal(result.edit.edges.bottom,50);
 assert.deepEqual(setImageEdit(p,'a',result.edit).canvas,project.canvas);assert.equal(result.guides[0].axis,'x');assert.equal(image.width,1000);
});
