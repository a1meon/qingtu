import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processImage} from '../engine/image.mjs';
import {resolveSpec,normalizeSpec,fitToSpec,specPlan,checkAsset,assetOk,ratioOk,formatBytes} from '../engine/spec.mjs';

const spec=resolveSpec('seedance');
const smart={mode:'smart',format:'png',targetBytes:30_000_000,resize:{type:'scale',percent:100}};
const solid=(width,height,channels=3)=>sharp({create:{width,height,channels,background:channels===4?{r:20,g:120,b:200,alpha:.5}:{r:20,g:120,b:200}}});
const compliant=(r)=>assetOk(spec,{width:r.width,height:r.height,bytes:r.buffer.length,format:r.format});

test('Seedance preset uses the shared 5999 px edge and exclusive 0.4/2.5 ratio bounds',()=>{
 assert.equal(spec.maxSide,5999);assert.equal(spec.minSide,300);
 assert.ok(!ratioOk(spec,2500,1000),'exactly 2.5 must fail');
 assert.ok(!ratioOk(spec,1000,2500),'exactly 0.4 must fail');
 assert.ok(ratioOk(spec,2499,1000)&&ratioOk(spec,1000,2499));
});

test('fitToSpec keeps compliant sizes untouched',()=>{
 assert.deepEqual(fitToSpec(spec,1920,1080),{width:1920,height:1080,reframe:false,scaled:false});
 assert.deepEqual(fitToSpec(null,10,10000),{width:10,height:10000,reframe:false,scaled:false});
});

test('fitToSpec scales undersize images up to the shortest side',()=>{
 const small=fitToSpec(spec,200,150);
 assert.equal(small.height,300);assert.equal(small.width,400);assert.ok(small.scaled);
});

test('reframing always lands strictly inside the ratio bounds',()=>{
 for(const fit of ['blur','crop','pad-black'])for(const [w,h] of [[5000,1000],[1000,5000],[2500,1000],[1000,2500],[5999,2399],[400,1000],[300,5999],[5999,300]]){
  const r=fitToSpec(spec,w,h,fit);
  assert.ok(ratioOk(spec,r.width,r.height),`${fit} ${w}x${h} → ${r.width}x${r.height}`);
  assert.ok(Math.min(r.width,r.height)>=300&&Math.max(r.width,r.height)<=5999,`${fit} ${w}x${h} → ${r.width}x${r.height}`);
 }
});

test('crop trims the long side instead of enlarging the short one',()=>{
 const wide=fitToSpec(spec,3000,600,'crop');
 assert.equal(wide.height,600);assert.equal(wide.width,1499);
 const tall=fitToSpec(spec,600,3000,'crop');
 assert.equal(tall.width,600);assert.equal(tall.height,1499);
 const pad=fitToSpec(spec,3000,600,'blur');
 assert.equal(pad.width,3000);assert.equal(pad.height,1201);
});

test('specPlan applies the export long-edge cap before the spec',()=>{
 const plan=specPlan({width:12000,height:6000},{type:'scale',percent:100},spec,'blur');
 assert.equal(plan.width,5999);assert.equal(plan.height,3000);
});

test('normalizeSpec swaps reversed bounds and caps the long edge',()=>{
 const n=normalizeSpec({minSide:8000,maxSide:200,ratioMin:3,ratioMax:0.5,maxBytes:'',maxCount:5});
 assert.equal(n.minSide,200);assert.equal(n.maxSide,5999);
 assert.equal(n.ratioMin,0.5);assert.equal(n.ratioMax,3);
 assert.equal(n.maxBytes,30_000_000);
});

test('checkAsset reports each failing rule',()=>{
 const rows=checkAsset(spec,{width:7000,height:200,bytes:31_000_000,format:'tiff'});
 assert.deepEqual(rows.map(r=>r.ok),[false,false,false,false]);
 assert.ok(assetOk(spec,{width:1920,height:1080,bytes:2_000_000,format:'png'}));
 assert.ok(!assetOk(spec,{width:1920,height:1080,bytes:30_000_000,format:'png'}),'30 MB itself is over the < 30 MB rule');
 assert.equal(checkAsset(null,{width:1,height:1,bytes:1,format:'png'}).length,0);
});

test('formatBytes never rounds a size up to a limit',()=>{
 assert.equal(formatBytes(9_996_000),'9.99 MB');
 assert.equal(formatBytes(29_999_999),'29.9 MB');
 assert.equal(formatBytes(1500),'1.5 KB');
});

for(const fit of ['blur','crop','pad-black','pad-white']){
 test(`a panorama is reframed by ${fit} into a compliant asset`,async()=>{
  const r=await processImage(await solid(3000,600).png().toBuffer(),{...smart,spec,fit});
  assert.ok(compliant(r));assert.ok(r.reframed&&r.adjusted);
  const meta=await sharp(r.buffer).metadata();
  assert.equal(meta.width,r.width);assert.equal(meta.height,r.height);
 });
}

test('an exact 2.5:1 image is treated as out of range and reframed',async()=>{
 const r=await processImage(await solid(2500,1000).png().toBuffer(),{...smart,spec,fit:'crop'});
 assert.ok(r.reframed);assert.ok(r.width/r.height<2.5);
});

test('a compliant original is kept byte-for-byte',async()=>{
 const source=await solid(1280,720).png().toBuffer();
 const r=await processImage(source,{...smart,spec});
 assert.ok(r.unchanged);assert.ok(r.buffer.equals(source));assert.ok(!r.adjusted);
});

test('the spec file limit is exclusive even when the user ceiling is higher',async()=>{
 const strict={...spec,maxBytes:20_000};
 const source=await sharp({create:{width:600,height:400,channels:3,noise:{type:'gaussian',mean:128,sigma:60}}}).png().toBuffer();
 const r=await processImage(source,{...smart,format:'jpeg',targetBytes:100_000_000,spec:strict});
 assert.ok(r.buffer.length<20_000);
});

test('transparent sources keep alpha through blur reframing',async()=>{
 const r=await processImage(await solid(2000,400,4).png().toBuffer(),{...smart,spec,fit:'blur'});
 assert.equal(r.format,'png');assert.ok(ratioOk(spec,r.width,r.height));
});

test('without a spec the engine keeps its existing stretch-free behaviour',async()=>{
 const r=await processImage(await solid(3000,600).png().toBuffer(),smart);
 assert.equal(r.width,3000);assert.equal(r.height,600);assert.ok(!r.adjusted);
});

test('report-only mode exports the original untouched while the spec is still checked',async()=>{
 const source=await solid(3000,600).png().toBuffer();
 const r=await processImage(source,{...smart,spec,fit:'none'});
 assert.equal(r.width,3000);assert.equal(r.height,600);assert.ok(r.unchanged&&!r.adjusted);
 assert.ok(!compliant(r));
 assert.deepEqual(fitToSpec(spec,3000,600,'none'),{width:3000,height:600,reframe:false,scaled:false});
});

test('the editor export reframes the composed canvas into the spec like compression',async()=>{
 const {stitchSpecPlan}=await import('../engine/stitch-service.mjs');
 const {SPEC_PRESETS}=await import('../engine/spec.mjs');
 const seedance=SPEC_PRESETS.find(p=>p.id==='seedance');
 assert.equal(stitchSpecPlan({spec:null},5995,2398),null);
 assert.equal(stitchSpecPlan({spec:seedance,fit:'none'},5995,2398),null);
 const wide=stitchSpecPlan({spec:seedance,fit:'blur'},5995,2398);
 assert.ok(wide.reframe&&wide.width/wide.height<2.5,`${wide.width}×${wide.height}`);
 const crop=stitchSpecPlan({spec:seedance,fit:'crop'},5995,2398);
 assert.ok(crop.width<5995&&crop.height===2398&&crop.width/crop.height<2.5);
 const fine=stitchSpecPlan({spec:seedance,fit:'blur'},3000,2000);
 assert.deepEqual([fine.width,fine.height,fine.reframe],[3000,2000,false]);
});

test('the editor render key changes with the spec so previews are not reused',async()=>{
 const {stitchRenderKey}=await import('../engine/stitch-render-input.mjs');
 const project={id:'p',images:[],export:{format:'png',targetBytes:1e7}};
 assert.notEqual(stitchRenderKey(project),stitchRenderKey({...project,export:{...project.export,spec:{id:'seedance'},fit:'crop'}}));
});

test('a composed raster is reframed without stretching for every fix mode',async()=>{
 const {reframeRaster}=await import('../engine/image.mjs');
 const info={width:500,height:200,channels:4},data=Buffer.alloc(500*200*4,200);
 for(const fit of ['blur','crop','pad-black','pad-white']){
  const size=fitToSpec(resolveSpec('seedance'),500,200,fit);
  const out=await reframeRaster(data,info,size,fit);
  assert.deepEqual([out.info.width,out.info.height],[size.width,size.height],fit);
  assert.equal(out.data.length,size.width*size.height*4,fit);
 }
});
