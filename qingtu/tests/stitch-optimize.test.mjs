import test from 'node:test';
import assert from 'node:assert/strict';
import {proportionalHorizontalEdits,optimizeHorizontal,optimizationEdits} from '../engine/stitch-optimize.mjs';
import {calculateLayout,initializeFree} from '../engine/stitch-layout.mjs';
import {imageGeometry,setImageEdit} from '../engine/stitch-edits.mjs';

const originals=[{id:'a',width:3072,height:4096},{id:'b',width:3072,height:4096},{id:'c',width:2160,height:3840},{id:'d',width:2160,height:3840}];
test('one-click crop assigns the same symmetric percentage to all original image ratios',()=>{
 const before=structuredClone(originals),edits=proportionalHorizontalEdits(originals);
 assert.equal(Object.keys(edits).length,4);
 for(const image of originals){assert.equal(edits[image.id].axis,'horizontal');assert.ok(Math.abs(edits[image.id].fraction-3/70)<1e-14);}
 const ratio=originals.reduce((sum,image)=>sum+image.width*(1-2*edits[image.id].fraction)/image.height,0);
 assert.ok(Math.abs(ratio-2.4)<1e-14);assert.deepEqual(originals,before);
});
test('optimization recomputes from originals and preserves order regardless of old crops',()=>{
 const images=originals.slice().reverse().map(image=>({...image,crop:{left:.3,top:.1}}));
 const first=proportionalHorizontalEdits(images),second=proportionalHorizontalEdits(images);
 assert.deepEqual(first,second);assert.deepEqual(Object.keys(first),images.map(image=>image.id));
 assert.equal(first.a.fraction,proportionalHorizontalEdits(originals).a.fraction);
});
test('symmetric cropping adapts narrow originals and rejects sub-pixel source content',()=>{
 assert.deepEqual(proportionalHorizontalEdits([{id:'a',width:100,height:100}]),{a:{axis:'horizontal',fraction:0}});
 assert.throws(()=>proportionalHorizontalEdits([{id:'a',width:1,height:100},{id:'b',width:100,height:1}]),/不足 1/);
 assert.throws(()=>proportionalHorizontalEdits([]),/添加图片/);
 assert.throws(()=>proportionalHorizontalEdits([{id:'a',width:1.5,height:2}]),/尺寸无效/);
 assert.equal(proportionalHorizontalEdits([{id:'a',width:240,height:100}]).a.fraction,0);
});
test('legacy proportional crop exports a strict 5:2 canvas and rejects incompatible user resolutions',()=>{
 const p={images:originals,layout:'horizontal',edits:proportionalHorizontalEdits(originals,2.5),export:{longEdge:5995}};
 const r=calculateLayout(p);assert.deepEqual([r.width,r.height],[5995,2398]);assert.equal(r.width*2,r.height*5);
 assert.equal(r.rects.reduce((sum,rect)=>sum+rect.width,0),5995);
 for(let n=0;n<r.rects.length;n++){const rect=r.rects[n];assert.equal(rect.autoCrop,false);assert.equal(rect.proportionalCrop,true);assert.ok(Math.abs(rect.width-originals[n].width/originals[n].height*(20/21)*2398)<=1);assert.ok(Math.abs(rect.crop.left-1/42)<1e-14);assert.equal(rect.crop.left,rect.crop.right);}
 for(const longEdge of [5,100,1200,5995]){const layout=calculateLayout({...p,export:{longEdge}});assert.equal(layout.width*2,layout.height*5);}
 for(const longEdge of [1,5999,5998])assert.throws(()=>calculateLayout({...p,export:{longEdge}}),/严格 2.5:1/);
 assert.deepEqual(imageGeometry(originals[0],p.edits.a),{left:3072*p.edits.a.fraction,top:0,width:3072*(20/21),height:4096});
 for(const edit of [{axis:'invalid',fraction:.1},{axis:'horizontal',fraction:.5},{axis:'horizontal',fraction:NaN},{axis:'horizontal',fraction:.1,amount:1}])assert.throws(()=>imageGeometry(originals[0],edit),/数据无效/);
});
test('explicit percentage crops remain editable, resettable and retain visible centres entering free',()=>{
 const p={images:originals,layout:'horizontal',edits:proportionalHorizontalEdits(originals,2.5),export:{longEdge:5995}};
 const r=calculateLayout(p),free=initializeFree(p,r,'centres');
 for(const rect of r.rects){assert.ok(Math.abs(free.positions[rect.id].x+free.positions[rect.id].width/2-(rect.x+rect.width/2))<1e-9);assert.deepEqual(free.edits[rect.id],p.edits[rect.id]);}
 const edited=setImageEdit(p,'a',{axis:'vertical',amount:10});assert.deepEqual(edited.edits.a,{axis:'vertical',amount:10});assert.equal(imageGeometry(originals[0],edited.edits.a).left,0);
 const reset=setImageEdit(free,'a',{axis:'horizontal',amount:0});assert.equal(imageGeometry(originals[0],reset.edits.a).width,3072);
 assert.ok(Math.abs(reset.positions.a.x+reset.positions.a.width/2-(free.positions.a.x+free.positions.a.width/2))<1e-9);
});
test('optimization replaces every prior crop in one immutable edit and is idempotent',()=>{
 const p={images:originals,layout:'horizontal',edits:{a:{axis:'vertical',amount:500},c:{axis:'horizontal',amount:100}},grid:{rows:2,columns:2},positions:{a:{x:1,y:2,width:30}},export:{longEdge:5999,targetBytes:40000000,format:'png'}};
 const before=structuredClone(p),next=optimizeHorizontal(p);
 assert.deepEqual(p,before);assert.deepEqual(next.edits.c.edges,{left:100,right:100,top:576,bottom:0});assert.deepEqual(next.export,{...p.export,longEdge:5988});assert.equal(next.images,p.images);assert.equal(next.positions,p.positions);assert.equal(next.grid,p.grid);
 assert.equal(optimizeHorizontal(next),next,'repeated click does not change state or enqueue another encoding');
 assert.equal(optimizeHorizontal({...p,export:{...p.export,longEdge:1200}}).export.longEdge,1200);
 assert.equal(optimizeHorizontal({...p,export:{...p.export,longEdge:1234}}).export.longEdge,1224);
 assert.throws(()=>optimizeHorizontal({...p,layout:'free'}),/切换横排/);
 assert.throws(()=>optimizeHorizontal({...p,export:{longEdge:0}}),/长边/);
});
test('integer allocation stays within one pixel of equal-height scaling for up to 100 mixed images',()=>{
 for(const count of [3,4,17,100]){
  const images=Array.from({length:count},(_,n)=>({id:'image-'+n,width:1000+(n*791)%3600,height:800+(n*313)%4000}));
  const p=optimizeHorizontal({images,layout:'horizontal',export:{longEdge:5999}}),r=calculateLayout(p);
  assert.equal(r.width*5,r.height*12);assert.equal(r.rects.reduce((sum,rect)=>sum+rect.width,0),r.width);
  for(const [n,rect] of r.rects.entries()){const source=imageGeometry(images[n],p.edits[images[n].id]);assert.ok(Math.abs(rect.width-source.width/source.height*r.height)<1);}
 }
});

test('third portrait has exact source cuts while the other originals share the remaining crop budget',()=>{
 const edits=optimizationEdits(originals);
 assert.deepEqual(edits.c,{edges:{left:100,right:100,top:576,bottom:0},links:{horizontal:true,vertical:false}});
 for(const id of ['a','b','d'])assert.ok(Math.abs(edits[id].fraction-(1-(2.4-1960/3264)/2.0625)/2)<1e-12);
 const ratio=originals.reduce((sum,image)=>{const g=imageGeometry(image,edits[image.id]);return sum+g.width/g.height;},0);
 assert.ok(Math.abs(ratio-2.4)<1e-12);
 const reordered=[originals[0],originals[2],originals[1],originals[3]],next=optimizationEdits(reordered);
 assert.deepEqual(next.b.edges,{left:100,right:100,top:614,bottom:0},'current third image receives the default, without identifying people');
 assert.ok(next.c.fraction>0);assert.equal(next.c.edges,undefined);
 assert.throws(()=>optimizationEdits([{id:'a',width:1000,height:1000},{id:'b',width:120,height:1000},{id:'c',width:1000,height:1000}]),/不足 1/);
 assert.throws(()=>optimizationEdits([{id:'a',width:1000,height:1000},{id:'b',width:5000,height:1000},{id:'c',width:1000,height:1000}]),/占满比例上限/);
});
