import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLayout,validateCanvas,moveImage,snapPosition,appendFreeImages,initializeFree} from '../engine/stitch-layout.mjs';
const image=(id,width,height)=>({id,assetId:id,width,height});
const config=(images,layout='horizontal',longEdge=5999)=>({images,layout,export:{longEdge}});
test('four 4K portraits have exactly 5999 x 2400, zero gaps and only 9:16 crops',()=>{
 const images=[image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)];
 const before=structuredClone(images),r=calculateLayout(config(images));
 assert.deepEqual([r.width,r.height],[5999,2400]);assert.deepEqual(r.rects.map(i=>i.width),[1800,1800,1199,1200]);
 assert.deepEqual(r.rects.map(i=>i.x),[0,1800,3600,4799]);assert.ok(r.rects.slice(0,2).every(i=>i.crop===null));
 assert.ok(r.rects.slice(2).every(i=>i.crop&&i.crop.left===i.crop.right));assert.deepEqual(images,before);
});
test('equal-height and equal-width layouts scale differing source dimensions proportionally',()=>{
 const images=[image('a',800,600),image('b',400,600)];
 const h=calculateLayout(config(images,'horizontal',1200));assert.deepEqual(h.rects.map(r=>[r.width,r.height]),[[800,600],[400,600]]);
 const v=calculateLayout(config(images,'vertical',1200));assert.deepEqual(v.rects.map(r=>[r.width,r.height]),[[533,400],[533,800]]);
 assert.equal(v.rects[1].y,400);assert.equal(v.rects[0].crop,null);
});
test('final-canvas pixel and ratio limits are inclusive and validate custom resolution',()=>{
 assert.deepEqual(validateCanvas(5999,2400),{width:5999,height:2400});validateCanvas(5000,2000);validateCanvas(2000,5000);
 for(const [w,h] of [[6000,2400],[5999,2399],[2000,5001],[0,2000],[1.2,2]])assert.throws(()=>validateCanvas(w,h));
 assert.throws(()=>calculateLayout(config([image('a',1000,1000)],'horizontal',6000)),/长边/);
 const r=calculateLayout(config([image('a',3000,4000),image('b',3000,4000)],'horizontal',3000));assert.deepEqual([r.width,r.height],[3000,2000]);
});
test('unsupported ratios never crop non-9:16 images or vertical images',()=>{
 assert.throws(()=>calculateLayout(config([image('a',1600,900),image('b',1600,900)])),/仅 9:16/);
 assert.throws(()=>calculateLayout(config([image('a',900,1600),image('b',900,1600)],'vertical')),/竖排比例/);
 const r=calculateLayout(config([image('a',899,1600),image('b',899,1600)]));assert.ok(r.rects.every(i=>i.crop===null));
 assert.throws(()=>calculateLayout(config([image('a',1,10)])),/比例/);
});
test('reordering is immutable and changes actual rectangle order',()=>{
 const images=[image('a',100,100),image('b',100,100)];const reordered=moveImage(images,'a','b');
 assert.deepEqual(reordered.map(i=>i.id),['b','a']);assert.deepEqual(images.map(i=>i.id),['a','b']);
 assert.deepEqual(calculateLayout(config(reordered)).rects.map(i=>i.id),['b','a']);
});
test('snapping finds nearby edges and centres without moving distant objects',()=>{
 const other={x:0,y:0,width:100,height:100};const r=snapPosition({x:104,y:3,width:80,height:100},[other],6);
 assert.equal(r.x,100);assert.equal(r.y,0);assert.equal(r.guides.length,2);
 const distant=snapPosition({x:210,y:205,width:80,height:60},[other],6);assert.equal(distant.x,210);assert.equal(distant.guides.length,0);
});
test('tight grid fills every row to the same width without empty cells, stretch or crops',()=>{
 const images=[image('a',3000,4000),image('b',900,1600),image('c',1200,800)];
 const r=calculateLayout({...config(images,'grid',1200),grid:{rows:2,columns:2}});
 assert.equal(r.rects.length,3);assert.ok(r.rects.every(i=>i.crop===null));
 assert.equal(r.rects[0].height,r.rects[1].height);assert.equal(r.rects[0].width+r.rects[1].width,r.width);assert.equal(r.rects[2].width,r.width);assert.equal(r.rects[2].y,r.rects[0].height);assert.equal(r.rects[2].y+r.rects[2].height,r.height);
 for(let n=0;n<images.length;n++)assert.ok(Math.abs(r.rects[n].width-r.rects[n].height*images[n].width/images[n].height)<=1.2,'integer pixels preserve aspect within rounding');
 assert.throws(()=>calculateLayout({...config(images,'grid'),grid:{rows:4,columns:2}}),/行列/);
 assert.throws(()=>calculateLayout({...config(images,'grid'),grid:{rows:1,columns:2}}),/行列/);
 assert.throws(()=>calculateLayout({...config([image('a',9,16),image('b',9,16)],'grid'),grid:{rows:2,columns:1}}),/比例/);
});
test('free canvas is the full external bounds, including negative positions, with no hidden clipping',()=>{
 const images=[image('a',100,100),image('b',100,100)];
 const p={...config(images,'free',1000),positions:{a:{x:-20,y:-30,width:50},b:{x:80,y:20,width:100}}};
 const r=calculateLayout(p);assert.deepEqual([r.width,r.height],[1000,750]);assert.deepEqual(r.rects.map(i=>[i.x,i.y,i.width,i.height]),[[0,0,250,250],[500,250,500,500]]);assert.ok(r.rects.every(i=>i.crop===null));
 const invalid={...p,positions:{...p.positions,b:{x:1000,y:20,width:100}}};assert.throws(()=>calculateLayout(invalid),/自由画布比例/);
 const draft=calculateLayout(invalid,{draft:true});assert.ok(draft.width/draft.height>2.5);assert.equal(draft.rects[1].x+draft.rects[1].width,draft.width,'invalid preview includes the whole image and adds no padding');
 assert.deepEqual(p.positions.a,{x:-20,y:-30,width:50});
});
test('free imports keep existing positions and append at the first existing image height',()=>{
 const a=image('a',100,200),b=image('b',200,100),c=image('c',90,160);
 const project={images:[a],layout:'free',positions:{a:{x:-20,y:15,width:50}}};
 const next=appendFreeImages(project,[b,c]);assert.deepEqual(next.positions.a,project.positions.a);assert.deepEqual(next.positions.b,{x:30,y:15,width:200});assert.deepEqual(next.positions.c,{x:230,y:15,width:56.25});assert.deepEqual(project.images,[a]);
 const first=appendFreeImages({images:[],layout:'free',positions:{}},[b]);assert.deepEqual(first.positions.b,{x:0,y:0,width:200});
});
test('entering free from an uncropped layout restores exact proportions and preserves centres',()=>{
 const p=config([image('a',120,80),image('b',60,80)],'horizontal',1200),layout=calculateLayout(p),free=initializeFree(p,layout);
 for(const rect of layout.rects){const position=free.positions[rect.id];assert.ok(Math.abs(position.x+position.width/2-(rect.x+rect.width/2))<1e-9);}
 assert.ok(calculateLayout(free).rects.every(i=>i.crop===null));
 const cropped=config([image('a',3,4),image('b',3,4),image('c',9,16),image('d',9,16)]);assert.throws(()=>initializeFree(cropped,calculateLayout(cropped)),/确认/);
});
test('entering free from cropped horizontal restores every full image and keeps height and centres',()=>{
 const p=config([image('a',3072,4096),image('b',3072,4096),image('c',2160,3840),image('d',2160,3840)]),layout=calculateLayout(p),free=initializeFree(p,layout,'centres');
 for(const rect of layout.rects){const source=free.images.find(i=>i.id===rect.id),position=free.positions[rect.id];assert.equal(position.width*source.height/source.width,rect.height);assert.ok(Math.abs(position.x+position.width/2-rect.x-rect.width/2)<1e-9);}
 assert.equal(free.positions.c.width,1350);assert.equal(free.positions.d.width,1350);assert.throws(()=>calculateLayout(free),/自由画布比例/);
 const draft=calculateLayout(free,{draft:true});assert.ok(draft.rects.every(i=>i.crop===null));assert.ok(draft.width/draft.height>2.5,'never add transparent padding to mask conflict');
});
