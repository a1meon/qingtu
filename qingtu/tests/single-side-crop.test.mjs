import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {cropLimit,imageGeometry,setImageEdit,cropEdges} from '../engine/stitch-edits.mjs';
import {composeProject} from '../engine/stitch-service.mjs';

test('single-side crops remove only the chosen edge and permit all but one source pixel',()=>{
 const image={width:90,height:160};
 for(const [axis,geometry] of [['top',{left:0,top:30,width:90,height:130}],['bottom',{left:0,top:0,width:90,height:130}],['left',{left:30,top:0,width:60,height:160}],['right',{left:0,top:0,width:60,height:160}]]){
  assert.deepEqual(imageGeometry(image,{axis,amount:30}),geometry);const max=cropLimit(image,axis),last=imageGeometry(image,{axis,amount:max});assert.ok(last.width===1||last.height===1);assert.throws(()=>imageGeometry(image,{axis,amount:max+1}),/至少保留/);
 }
 assert.equal(cropLimit(image,'horizontal'),44);assert.equal(cropLimit(image,'vertical'),79);assert.throws(()=>imageGeometry(image,{axis:'top',amount:1.5}),/原图像素/);
 assert.deepEqual(cropEdges({width:4,height:8},{axis:'horizontal',fraction:.375}),{left:1,top:0,right:1,bottom:0},'opening a fractional crop never rounds away the final source pixel');
});

test('actual single-side crop exports omit the intended source edge, including bottom/right-only extractions',async()=>{
 const width=12,height=16,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=(y*width+x)*4;data[n]=x*10;data[n+1]=y*10;data[n+2]=80;data[n+3]=255;}
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer(),image={id:'a',assetId:'a',width,height,bytes:source.length},project={id:'crop',canvasMode:'fixed',layout:'horizontal',images:[image],positions:{a:{x:0,y:0,width,height}},edits:{},canvas:{width,height},export:{format:'png',targetBytes:10000}};
 for(const axis of ['top','bottom','left','right']){
  const edited=setImageEdit(project,'a',{axis,amount:3}),geometry=imageGeometry(image,edited.edits.a);edited.canvas={width:geometry.width,height:geometry.height};edited.positions.a={x:0,y:0,width:geometry.width,height:geometry.height};
  const result=await composeProject(edited,{readAsset:async()=>source}),expected=await sharp(source).extract(geometry).ensureAlpha().raw().toBuffer();assert.deepEqual(result.data,expected);assert.deepEqual(project.edits,{});
 }
});
