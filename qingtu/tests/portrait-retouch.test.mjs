import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPortraitRetouch,normalizePortraitRetouch} from '../engine/portrait-retouch.mjs';

const W=400,H=400;
// Light background, a dark elliptical "face" and two white "eyes".
function portrait({cx=.5,cy=.5,rx=.22,ry=.3,eyes=true,gradient=false}={}){
 const px=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,nx=((x+.5)/W-cx)/rx,ny=((y+.5)/H-cy)/ry;
  let v=nx*nx+ny*ny<=1?40:gradient?Math.round(150+y*.25):220;
  if(eyes&&[-.42,.42].some(ex=>((nx-ex)/.12)**2+((ny+.25)/.08)**2<=1))v=255;
  px[i]=px[i+1]=px[i+2]=v;px[i+3]=255;
 }
 return px;
}
const dark=(px,x,y)=>px[(y*W+x)*4]<130;
function rowSpan(px,y){let a=-1,b=-1;for(let x=0;x<W;x++)if(dark(px,x,y)){if(a<0)a=x;b=x;}return a<0?0:b-a+1;}
function colExtent(px,x){let a=-1,b=-1;for(let y=0;y<H;y++)if(dark(px,x,y)){if(a<0)a=y;b=y;}return [a,b];}
function eyeCentres(px,y){const xs=[];for(let x=0;x<W;x++)if(px[(y*W+x)*4]>240&&x>W*.25&&x<W*.75)xs.push(x);const left=xs.filter(x=>x<W/2),right=xs.filter(x=>x>=W/2);const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;return [mean(left),mean(right)];}
const frame={width:W,height:H};

test('small head works on a close-up whose head fills the frame without smearing the borders',()=>{
 const source=portrait({cx:.5,cy:.52,rx:.34,ry:.4,gradient:true});
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.4,rx:.5,ry:.6},headSize:100},frame);
 // The crown is cut off, so the top edge is the anchor and must not move.
 // (The sides may shift vertically with the lifted content.)
 for(let x=0;x<W;x++)assert.ok(Math.abs(out[x*4]-source[x*4])<=6,`row 0 col ${x}`);
 // A clamped sample would copy the top row downwards; the top band must stay
 // close to the original gradient instead.
 let diff=0,count=0;for(let y=0;y<14;y++)for(let x=0;x<W;x+=4){diff+=Math.abs(out[(y*W+x)*4]-source[(y*W+x)*4]);count++;}
 assert.ok(diff/count<2,`top band changed by ${(diff/count).toFixed(2)} on average`);
 assert.ok(rowSpan(out,Math.round(H*.6))<rowSpan(source,Math.round(H*.6))-8,'the face gets narrower');
 const [,chin0]=colExtent(source,W/2),[,chin1]=colExtent(out,W/2);
 assert.ok(chin0-chin1>=2,`with the crown cut off the chin rises (${chin0-chin1}px)`);
});

test('close-up small head (box clamped to the top edge) shrinks the face evenly without seams',()=>{
 // Detection clamps the head box to the frame: y-ry === 0 for close-ups.
 const source=portrait({cx:.5,cy:.55,rx:.3,ry:.36,gradient:true});
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.5,rx:.42,ry:.5},headSize:100},frame);
 const [top0,chin0]=colExtent(source,W/2),[top1,chin1]=colExtent(out,W/2);
 assert.ok(chin0-chin1>=4,`chin rises (${chin0-chin1}px)`);
 assert.ok(top1-top0>=2,`the top of the face comes down (${top1-top0}px)`);
 assert.ok((chin1-top1)<(chin0-top0)-8,'the face is shorter');
 // Background column outside the face: neighbouring rows never jump.
 for(let y=1;y<H;y++)assert.ok(Math.abs(out[(y*W+20)*4]-out[((y-1)*W+20)*4])<=3,`seam at row ${y}`);
});

test('full-length small head leaves straight lines above the head in place',()=>{
 // A door lintel 0.7 head heights above the crown, as in a doorway portrait.
 const source=portrait({cx:.5,cy:.42,rx:.1,ry:.13,eyes:false});
 for(let x=0;x<W;x++)for(const y of [50,51,52]){const i=(y*W+x)*4;source[i]=source[i+1]=source[i+2]=0;}
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.4,rx:.12,ry:.16},headSize:100},frame);
 for(let x=0;x<W;x+=10)assert.ok(out[(51*W+x)*4]<40,`line stays at column ${x}`);
});

test('full-length small head has no seam below the chin',()=>{
 const source=portrait({cx:.5,cy:.42,rx:.14,ry:.2,eyes:false,gradient:true});
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.4,rx:.17,ry:.24},headSize:100},frame);
 for(let y=1;y<H;y++)assert.ok(Math.abs(out[(y*W+100)*4]-out[((y-1)*W+100)*4])<=3,`seam at row ${y}`);
});

test('no geometry samples beyond the frame, even for strong edits touching the borders',()=>{
 const source=portrait({cx:.5,cy:.5,rx:.49,ry:.49,gradient:true});
 const out=applyPortraitRetouch(source.slice(),{face:{x:.5,y:.5,rx:.49,ry:.49},slim:100,head:{x:.5,y:.45,rx:.6,ry:.7},headSize:100},frame);
 // Border pixels may only take values found on that border in the source.
 for(const y of [0,H-1]){const row=new Set();for(let x=0;x<W;x++)row.add(source[(y*W+x)*4]);
  for(let x=0;x<W;x++)assert.ok([...row].some(v=>Math.abs(v-out[(y*W+x)*4])<=8),`row ${y}`);}
});

test('full-length small head shrinks the whole head: the crown comes down, the jaw comes up',()=>{
 const source=portrait({cx:.5,cy:.42,rx:.14,ry:.2,eyes:false});
 const head={x:.5,y:.4,rx:.17,ry:.24};
 const out=applyPortraitRetouch(source.slice(),{head,headSize:100},frame);
 const [top0,bottom0]=colExtent(source,W/2),[top1,bottom1]=colExtent(out,W/2);
 assert.ok(top1-top0>=6,`crown moved ${top1-top0}px`);
 assert.ok(bottom0-bottom1>=4,`jaw moved ${bottom0-bottom1}px`);
 assert.ok(rowSpan(out,Math.round(H*.42))<rowSpan(source,Math.round(H*.42)));
});

test('slim face narrows the jaw while the eyes keep their place',()=>{
 const source=portrait();
 const face={x:.5,y:.5,rx:.22,ry:.3};
 const out=applyPortraitRetouch(source.slice(),{face,slim:100},frame);
 const jaw=Math.round(H*(.5+.3*.62)),eyeRow=Math.round(H*(.5-.3*.25));
 const jawLoss=rowSpan(source,jaw)-rowSpan(out,jaw),browLoss=rowSpan(source,Math.round(H*(.5-.3*.6)))-rowSpan(out,Math.round(H*(.5-.3*.6)));
 assert.ok(jawLoss>=10,`jaw narrowed by ${jawLoss}px`);
 assert.ok(jawLoss>browLoss*2,`jaw ${jawLoss}px vs forehead ${browLoss}px`);
 const [l0,r0]=eyeCentres(source,eyeRow),[l1,r1]=eyeCentres(out,eyeRow);
 assert.ok(Math.abs(l1-l0)<=2&&Math.abs(r1-r0)<=2,`eyes moved ${l1-l0}, ${r1-r0}`);
});

test('skin smoothing softens fine noise inside the face only',()=>{
 const source=portrait({eyes:false});
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,n=((x*13+y*7)%5)*6;source[i]=source[i+1]=source[i+2]=Math.min(255,source[i]+n);}
 const out=applyPortraitRetouch(source.slice(),{face:{x:.5,y:.5,rx:.22,ry:.3},skin:100},frame);
 const spread=(px,x0,y0)=>{const v=[];for(let y=y0;y<y0+10;y++)for(let x=x0;x<x0+10;x++)v.push(px[(y*W+x)*4]);const m=v.reduce((s,a)=>s+a,0)/v.length;return v.reduce((s,a)=>s+(a-m)**2,0)/v.length;};
 assert.ok(spread(out,195,195)<spread(source,195,195)*.6,'face noise reduced');
 assert.equal(spread(out,10,10),spread(source,10,10),'background untouched');
});

test('a head-only retouch normalizes without a face box',()=>{
 const value=normalizePortraitRetouch({head:{x:.5,y:.4,rx:.5,ry:.6},headSize:40});
 assert.deepEqual(value,{turn:0,head:{x:.5,y:.4,rx:.5,ry:.6},headSize:40});
});

test('a soft push stroke moves the contour in the stroke direction and nothing far away',()=>{
 const source=portrait({eyes:false});
 const path=[];for(let i=0;i<6;i++)path.push({x:.72-i*.004,y:.55,dx:-.004,dy:0,radius:.06});
 const out=applyPortraitRetouch(source.slice(),{strokes:[{kind:'push',soft:true,path}]},frame);
 const row=Math.round(H*.55);
 assert.ok(rowSpan(out,row)<rowSpan(source,row),'the right contour moved inward');
 assert.equal(out[(20*W+20)*4],source[(20*W+20)*4],'far pixels untouched');
});

test('leg lengthening stretches the legs and keeps the feet whole',()=>{
 // A figure: torso above y=.5, legs from .5 to .85, dark feet .85-.9.
 const px=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,fx=(x+.5)/W,fy=(y+.5)/H;
  const v=Math.abs(fx-.5)<.08&&fy>.2&&fy<.85?60:Math.abs(fx-.5)<.1&&fy>=.85&&fy<.9?10:220;px[i]=px[i+1]=px[i+2]=v;px[i+3]=255;}
 const legs={hip:.5,ankle:.84,x:.5,radius:.25,foot:.89,lock:.83,core:.09};
 const out=applyPortraitRetouch(px.slice(),{legs,length:100},frame);
 const footTop=img=>{for(let y=0;y<H;y++)if(img[(y*W+W/2)*4]<30)return y;return -1;};
 const footHeight=img=>{let n=0;for(let y=0;y<H;y++)if(img[(y*W+W/2)*4]<30)n++;return n;};
 assert.ok(footTop(out)>footTop(px)+4,`feet moved down ${footTop(out)-footTop(px)}px`);
 assert.ok(Math.abs(footHeight(out)-footHeight(px))<=2,'the feet keep their height');
});

test('forward-warp push carries a feature along the stroke without folding',()=>{
 // Gradient image (value = column) with a dark dot at x=0.40.
 const px=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,v=Math.round(x*.6);px[i]=px[i+1]=px[i+2]=v;px[i+3]=255;
  if(Math.hypot(x+.5-160,y+.5-200)<5){px[i]=255;px[i+1]=0;px[i+2]=0;}}
 const path=[];for(let i=0;i<20;i++)path.push({x:.40+i*.004,y:.5,dx:.004,dy:0,radius:.09});
 const out=applyPortraitRetouch(px.slice(),{strokes:[{kind:'push',soft:true,path}]},frame);
 let reddest=-1,best=0;for(let x=0;x<W;x++){const i=(200*W+x)*4,r=out[i]-out[i+1];if(r>best){best=r;reddest=x;}}
 // Like professional forward warp, content follows the brush at a fraction
 // of its speed (a 1:1 drag stretches a small patch over the whole trail).
 assert.ok(reddest-160>=0.35*32&&reddest-160<=32,`the dot followed the brush by ${reddest-160}px of 32`);
 // Along the row the sampled gradient never decreases: no folding or tearing.
 for(let x=1;x<W;x++){const a=out[(150*W+x-1)*4],b=out[(150*W+x)*4];assert.ok(b>=a-1,`fold at column ${x}`);}
});

test('contour slimming follows the detected jawline and leaves the eyes in place',()=>{
 const source=portrait();
 const face={x:.5,y:.5,rx:.22,ry:.3,oval:Array.from({length:36},(_,k)=>{const a=-Math.PI/2+k/36*Math.PI*2;return {x:.5+.22*Math.cos(a),y:.5+.3*Math.sin(a)};})};
 const out=applyPortraitRetouch(source.slice(),{face,slim:100},frame);
 const jaw=Math.round(H*(.5+.3*.62)),eyeRow=Math.round(H*(.5-.3*.25));
 assert.ok(rowSpan(source,jaw)-rowSpan(out,jaw)>=8,`jaw narrowed ${rowSpan(source,jaw)-rowSpan(out,jaw)}px`);
 const [l0,r0]=eyeCentres(source,eyeRow),[l1,r1]=eyeCentres(out,eyeRow);
 assert.ok(Math.abs(l1-l0)<=2&&Math.abs(r1-r0)<=2,`eyes moved ${l1-l0}, ${r1-r0}`);
 const brow=Math.round(H*(.5-.3*.6));
 assert.ok(Math.abs(rowSpan(source,brow)-rowSpan(out,brow))<=3,'the forehead keeps its width');
});

test('skin smoothing touches skin tones only',()=>{
 // Left half warm skin tone with fine noise, right half a blue shirt with the same noise, both inside the face box.
 const px=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,n=((x*13+y*7)%5)*6;
  if(x<W/2){px[i]=200+n/2;px[i+1]=150+n;px[i+2]=120+n;}else{px[i]=40+n;px[i+1]=70+n;px[i+2]=170+n;}px[i+3]=255;}
 const out=applyPortraitRetouch(px.slice(),{face:{x:.5,y:.5,rx:.3,ry:.4},skin:100},frame);
 const spread=(img,x0,y0)=>{const v=[];for(let y=y0;y<y0+10;y++)for(let x=x0;x<x0+10;x++)v.push(img[(y*W+x)*4+1]);const m=v.reduce((s,a)=>s+a,0)/v.length;return v.reduce((s,a)=>s+(a-m)**2,0)/v.length;};
 assert.ok(spread(out,150,195)<spread(px,150,195)*.6,'skin texture is softened');
 assert.ok(spread(out,240,195)>spread(px,240,195)*.9,'the blue shirt keeps its texture');
});

test('colour clone carries split toning: cool shadows and warm highlights',async()=>{
 const {colorStatistics,matchImageColor,applyImageColor,normalizeImageColor}=await import('../engine/image-color.mjs');
 const ramp=(tint)=>{const px=new Uint8ClampedArray(64*64*4);for(let i=0;i<64*64;i++){const v=Math.round((i%64)/63*255);const t=tint(v);px.set([Math.max(0,Math.min(255,v+t[0])),v,Math.max(0,Math.min(255,v+t[1])),255],i*4);}return px;};
 const target=ramp(()=>[0,0]);
 const reference=ramp(v=>v<100?[-18,22]:v>170?[20,-16]:[0,0]); // blue shadows, warm highlights
 const match={...matchImageColor(colorStatistics(target),colorStatistics(reference)),strength:100,luminance:false};
 assert.ok(match.bands,'band residuals detected');
 const out=applyImageColor(target.slice(),normalizeImageColor({match}),{width:64,height:64});
 const at=x=>{const i=(32*64+x)*4;return {warm:out[i]-out[i+2]};};
 assert.ok(at(8).warm<-10,`shadows turn cool (${at(8).warm})`);
 assert.ok(at(58).warm>10,`highlights turn warm (${at(58).warm})`);
});

test('small head scales the head uniformly, so it is never squashed',()=>{
 const source=portrait({cx:.5,cy:.42,rx:.12,ry:.16,eyes:false});
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.42,rx:.14,ry:.19},headSize:100},frame);
 const [t0,b0]=colExtent(source,W/2),[t1,b1]=colExtent(out,W/2);
 const row=Math.round(H*.42),sx=rowSpan(out,row)/rowSpan(source,row),sy=(b1-t1)/(b0-t0);
 assert.ok(sx<.95&&sy<.95,`head shrinks (${sx.toFixed(3)} × ${sy.toFixed(3)})`);
 assert.ok(Math.abs(sx-sy)<.025,`same scale both ways (${sx.toFixed(3)} vs ${sy.toFixed(3)})`);
});

test('the interactive liquify preview matches the final render dab for dab',async()=>{
 const {createLiquifyPreview,extendLiquifyPath}=await import('../engine/portrait-retouch.mjs');
 const source=portrait({gradient:true});
 const live=createLiquifyPreview(source,{},frame),path=[];
 let last={x:.75,y:.5};
 for(let i=1;i<=12;i++){last=extendLiquifyPath(path,last,{x:.75-i*.006,y:.5+i*.002},.08,.08,'push',i===12);live.extend(path);}
 const full=applyPortraitRetouch(source.slice(),{strokes:[{kind:'push',soft:true,path}]},frame);
 assert.ok(path.length>4);
 assert.deepEqual(live.output,full);
});

test('close-up small head never moves the left, right or bottom frame edges',()=>{
 const source=portrait({cx:.5,cy:.55,rx:.42,ry:.45,gradient:true});
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;source[i+1]=Math.round(x*.6);}
 const out=applyPortraitRetouch(source.slice(),{head:{x:.5,y:.45,rx:.48,ry:.55},headSize:100},frame);
 for(let y=0;y<H;y+=4)for(const x of [0,1,2,W-3,W-2,W-1]){const i=(y*W+x)*4;assert.ok(Math.abs(out[i+1]-source[i+1])<=1&&Math.abs(out[i]-source[i])<=1,`edge pixel ${x},${y}`);}
 for(let x=0;x<W;x+=4)for(const y of [H-3,H-2,H-1]){const i=(y*W+x)*4;assert.ok(Math.abs(out[i]-source[i])<=1,`bottom pixel ${x},${y}`);}
 assert.ok(rowSpan(out,Math.round(H*.55))<rowSpan(source,Math.round(H*.55)),'the face still gets smaller');
});

test('after cropping, retouch never pulls cropped-away pixels into view',async()=>{
 const {portraitForCrop}=await import('../engine/portrait-retouch.mjs');
 // Left 30% is red (to be cropped away), the rest grey with a dark face.
 const source=portrait({cx:.55,cy:.5,rx:.2,ry:.28,eyes:false});
 for(let y=0;y<H;y++)for(let x=0;x<W*.3;x++){const i=(y*W+x)*4;source[i]=255;source[i+1]=0;source[i+2]=0;}
 const path=[];for(let i=0;i<10;i++)path.push({x:.36+i*.006,y:.5,dx:.006,dy:0,radius:.1});
 const retouch=portraitForCrop({strokes:[{kind:'push',soft:true,path}],head:{x:.55,y:.48,rx:.26,ry:.34},headSize:100},{left:.3});
 const out=applyPortraitRetouch(source.slice(),retouch,frame);
 for(let y=0;y<H;y+=2)for(let x=Math.ceil(W*.3)+1;x<W;x++){const i=(y*W+x)*4;assert.ok(!(out[i]>200&&out[i+1]<60),`red leaked to ${x},${y}`);}
});

test('美颜 small head shrinks the face evenly and leaves shoulders and frame alone',()=>{
 const source=portrait({cx:.5,cy:.45,rx:.2,ry:.27,eyes:false,gradient:true});
 // Shoulders: a dark band at the bottom.
 for(let y=Math.round(H*.85);y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;source[i]=source[i+1]=source[i+2]=20;}
 const face={x:.5,y:.45,rx:.2,ry:.27};
 const out=applyPortraitRetouch(source.slice(),normalizePortraitRetouch({face,faceSize:100}),frame);
 const row=Math.round(H*.45),sx=rowSpan(out,row)/rowSpan(source,row);
 const faceExtent=px=>{let a=-1,b=-1;for(let y=0;y<H*.8;y++)if(dark(px,W/2,y)){if(a<0)a=y;b=y;}return [a,b];};
 const [t0,b0]=faceExtent(source),[t1,b1]=faceExtent(out);
 assert.ok(sx<.96,`face narrower (${sx.toFixed(3)})`);
 assert.ok(t1>t0&&b1<b0,'crown comes down and chin comes up');
 for(let x=0;x<W;x+=8)assert.equal(out[(Math.round(H*.95)*W+x)*4],20,`shoulder at ${x}`);
 for(let y=0;y<H;y+=8)for(const x of [0,W-1])assert.equal(out[(y*W+x)*4],source[(y*W+x)*4],`edge ${x},${y}`);
});

test('瘦脸 on a turned face slims the near cheek and leaves the far side',()=>{
 const source=portrait({eyes:false});
 const oval=Array.from({length:36},(_,i)=>{const a=i/36*Math.PI*2;return {x:.5+Math.sin(a)*.22,y:.5-Math.cos(a)*.3};});
 const frontal=applyPortraitRetouch(source.slice(),{face:{x:.5,y:.5,rx:.22,ry:.3,oval},slim:100},frame);
 const turned=applyPortraitRetouch(source.slice(),{face:{x:.5,y:.5,rx:.22,ry:.3,oval,lean:.8},slim:100},frame);
 const jaw=Math.round(H*(.5+.3*.62));
 const edges=px=>{let a=-1,b=-1;for(let x=0;x<W;x++)if(dark(px,x,jaw)){if(a<0)a=x;b=x;}return [a,b];};
 const [l0,r0]=edges(source),[lf,rf]=edges(frontal),[lt,rt]=edges(turned);
 assert.ok(lf-l0>=4&&r0-rf>=4,`frontal slims both sides (${lf-l0}, ${r0-rf})`);
 // Nose points right (lean > 0): the right cheek is the far side.
 assert.ok(lt-l0>=4,`near (left) cheek slimmed by ${lt-l0}px`);
 assert.ok(r0-rt<=1,`far (right) cheek kept (${r0-rt}px)`);
});
