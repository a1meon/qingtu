import test from 'node:test';
import assert from 'node:assert/strict';
import {applyImageColor, colorStatistics, hasImageColor, matchImageColor, normalizeImageColor, setImageColors} from '../engine/image-color.mjs';
import {colorEffectFrame} from '../engine/color-effects.mjs';

const target = [45, 82, 114, 255, 108, 132, 164, 255, 168, 177, 190, 180];
const reference = [94, 69, 48, 255, 152, 123, 94, 255, 206, 174, 128, 180];
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const pixelDistance = (a, b) => a.reduce((sum, value, index) =>
  sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0);

test('matching the full reference moves the target palette closer and preserves its alpha', () => {
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const pixels = Uint8ClampedArray.from(target);
  applyImageColor(pixels, {match: {...match, strength: 100, luminance: true}});
  assert.ok(pixelDistance([...pixels], reference) < pixelDistance(target, reference) / 3);
  assert.deepEqual([pixels[3], pixels[7], pixels[11]], [255, 255, 180]);
  assert.ok(pixels[0] < pixels[4] && pixels[4] < pixels[8], 'target detail remains visible');
});

test('color-only matching preserves brightness and strength interpolates from the original', () => {
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const at = strength => {
    const pixels = Uint8ClampedArray.from(target);
    applyImageColor(pixels, {match: {...match, strength}});
    return [...pixels];
  };
  const full = at(100), half = at(50);
  assert.deepEqual(at(0), target);
  assert.ok(pixelDistance(full, target) > pixelDistance(half, target));
  assert.ok(pixelDistance(half, target) > 0);
  for (let index = 0; index < target.length; index += 4) {
    assert.ok(Math.abs(luma(...target.slice(index, index + 3)) - luma(...full.slice(index, index + 3))) <= 1);
  }
});

test('transparent pixels carry no weight in analysis, while a solid reference can match a flat target', () => {
  const stats = colorStatistics([10, 20, 30, 255]);
  assert.deepEqual(colorStatistics([250, 7, 67, 0, 10, 20, 30, 255]), stats);
  assert.throws(() => colorStatistics([255, 255, 255, 0]), /透明/);
  const match = matchImageColor(stats, colorStatistics([70, 60, 50, 255]));
  const result = Uint8Array.of(10, 20, 30, 255, 20, 40, 80, 0);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result], [70, 60, 50, 255, 20, 40, 80, 0]);
});

test('manual exposure lifts midtones and a neutral edit removes the saved adjustment', () => {
  const pixels = Uint8Array.of(128, 128, 128, 123);
  applyImageColor(pixels, {adjustments: {exposure: 1}});
  assert.ok(pixels[0] > 150 && pixels[0] === pixels[1] && pixels[1] === pixels[2]);
  assert.equal(pixels[3], 123);
  const project = {images: [{id: 'one'}, {id: 'two'}]};
  const updated = setImageColors(project, new Map([['one', {adjustments: {exposure: 1}}]]));
  assert.deepEqual(updated.images[0].color.adjustments, {exposure: 1});
  assert.equal(updated.images[1], project.images[1]);
  assert.deepEqual(setImageColors(updated, new Map([['one', {adjustments: {exposure: 0}}]])), project);
});

test('matching agrees with the visible base adjustment after it clips highlights', () => {
  const pixels = [192, 192, 192, 255];
  const adjusted = Uint8Array.from(pixels), adjustments = {exposure: 1};
  applyImageColor(adjusted, {adjustments});
  assert.deepEqual([...adjusted], [255, 255, 255, 255]);
  const match = matchImageColor(colorStatistics(adjusted), colorStatistics([64, 64, 64, 255]));
  const result = Uint8Array.from(pixels);
  applyImageColor(result, {adjustments, match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result], [64, 64, 64, 255]);
});

test('luminance matching holds a shared white background even when it covers different areas', () => {
  const referenceWhite = [247, 246, 245, 255];
  const targetWhite = [246, 245, 244, 255];
  const reference = [74, 69, 65, 255, 95, 91, 84, 255, 130, 115, 108, 255, ...referenceWhite];
  const target = [101, 99, 96, 255, 126, 121, 112, 255, 145, 138, 130, 255,
    ...targetWhite, ...targetWhite, ...targetWhite, ...targetWhite, ...targetWhite];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  for (let index = 12; index < result.length; index += 4) {
    assert.deepEqual([...result.slice(index, index + 4)], targetWhite);
  }
  assert.ok(pixelDistance([...result.slice(0, 12)], reference.slice(0, 12)) <
    pixelDistance(target.slice(0, 12), reference.slice(0, 12)) / 2);
});

test('luminance matching still adjusts whites when the reference genuinely has a darker background', () => {
  const target = [90, 85, 80, 255, 246, 246, 246, 255];
  const reference = [80, 75, 70, 255, 205, 205, 205, 255];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.ok(result[4] < 225);
});

test('matching holds a shared off-white background under softer lighting', () => {
  const shade = [220, 220, 220, 255];
  const target = [120, 120, 120, 255, 140, 140, 140, 255, 155, 155, 155, 255,
    ...shade, ...shade, ...shade, ...shade, ...shade];
  const reference = [65, 65, 65, 255, 85, 85, 85, 255, 100, 100, 100, 255, ...shade];
  const match = matchImageColor(colorStatistics(target), colorStatistics(reference));
  const result = Uint8Array.from(target);
  applyImageColor(result, {match: {...match, luminance: true, strength: 100}});
  assert.deepEqual([...result.slice(12, 16)], shade);
  assert.ok(result[4] <= 90);
});

const grayscale = values => Uint8Array.from(values.flatMap(value => [value, value, value, 255]));

test('cloning a low-contrast reference retains luminance separation in the target texture', () => {
  const original = grayscale([42, 84, 120, 160, 205]);
  const reference = grayscale([118, 123, 128, 133, 138]);
  const match = matchImageColor(colorStatistics(original), colorStatistics(reference));
  const output = applyImageColor(original.slice(), {match: {...match, strength: 100, luminance: true}});
  assert.ok(output[16] - output[0] >= .75 * (original[16] - original[0]));
  assert.ok(Math.abs(output[8] - 128) < 6);
});

test('saved lightness matches roll off highlights and shadows without clipping distinct tones together', () => {
  for (const [values, offset] of [[[217, 233, 251], .22], [[4, 22, 39], -.22]]) {
    const result = applyImageColor(grayscale(values), {
      match: {gain: [1, 1, 1], offset: [offset, 0, 0], strength: 100, luminance: true},
    });
    assert.ok(result[0] > 0 && result[0] < result[4] && result[4] < result[8] && result[8] < 255);
  }
});

test('HSL targets its hue band and leaves neutral and transparent pixels alone', () => {
  const colors=Uint8Array.of(235,20,20,255,20,220,20,255,126,126,126,255,19,23,24,0);
  applyImageColor(colors,{hsl:{red:{hue:60}}});
  assert.deepEqual([...colors],[235,235,20,255,20,220,20,255,126,126,126,255,19,23,24,0]);
});

test('edited RGB curves and tonal wheels have independently valid persisted ranges', () => {
  const curves={red:[[0,0],[100,150],[255,255]]},wheels={midtones:{x:75}};
  const color=normalizeImageColor({curves,wheels});
  assert.deepEqual(color,{curves,wheels});
  assert.equal(hasImageColor({curves:{rgb:[[0,0],[255,255]]}}),false);
  assert.equal(normalizeImageColor({hsl:{red:{hue:0}},wheels:{highlights:{x:0,y:0}}}),undefined);
  assert.throws(()=>normalizeImageColor({hsl:{red:{hue:NaN}}}),/参数无效/);
  assert.throws(()=>normalizeImageColor({curves:{rgb:[[0,0],[100,80],[100,100],[255,255]]}}),/曲线/);
  assert.throws(()=>normalizeImageColor({wheels:{shadows:{x:100,y:100}}}),/色轮/);
  assert.deepEqual([...applyImageColor(grayscale([100]),{curves})],[150,100,100,255]);
  const tint=applyImageColor(grayscale([100]),{wheels});
  assert.ok(tint[0]>100&&tint[1]<100&&tint[2]<100);
});

test('texture effects preserve alpha and use source geometry across a clipped frame', () => {
  const values=grayscale(Array.from({length:25},()=>120));
  values[3]=128;
  const full=applyImageColor(values.slice(),{adjustments:{vignette:100}}, {width:5,height:5});
  const clip=colorEffectFrame({width:5,height:5},{sourceLeft:2,sourceTop:0,width:3,height:5});
  const clipped=applyImageColor(grayscale(Array(15).fill(120)),{adjustments:{vignette:100}},clip);
  assert.equal(full[3],128);
  assert.ok(full[0]<full[12*4]);
  assert.equal(clipped[0],full[2*4]);
  const data=grayscale([50,50,180,180,180]);
  const detail=applyImageColor(data.slice(),{adjustments:{sharpen:70,clarity:25}},{width:5,height:1});
  assert.ok(detail[4]<50&&detail[8]>180);
  const grain={adjustments:{grain:100}};
  const first=applyImageColor(values.slice(),grain,{width:5,height:5});
  assert.deepEqual(first,applyImageColor(values.slice(),grain,{width:5,height:5}));
  assert.notDeepEqual(first,values);
});

test('a centered vignette is neutral, while its left and right halves brighten and darken the corners',()=>{
  const samples=grayscale(Array(81).fill(126)),frame={width:9,height:9};
  const bright=applyImageColor(samples.slice(),normalizeImageColor({adjustments:{vignette:-80}}),frame);
  const dark=applyImageColor(samples.slice(),normalizeImageColor({adjustments:{vignette:80}}),frame);
  assert.ok(bright[0]>126&&dark[0]<126);
  assert.equal(bright[160],126);
  assert.equal(dark[160],126);
  assert.equal(normalizeImageColor({adjustments:{vignette:0}}),undefined);
});

test('portrait retouch keeps dimensions and untouched areas while moving localized detail',()=>{
  const width=80,height=96,frame={width,height};
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    pixels.set([x*3,y*2,(x+y)%70,x<4?80:255],i);
  }
  const color=normalizeImageColor({retouch:{
    legs:{hip:.42,ankle:.84,x:.5,radius:.34},length:80,
    face:{x:.5,y:.21,rx:.14,ry:.13},slim:70,
    strokes:[{x:.48,y:.25,dx:.04,dy:0,radius:.06,kind:'push'}],
  }});
  assert.equal(hasImageColor(color),true);
  const changed=applyImageColor(pixels.slice(),color,frame);
  const at=(x,y)=>((y*width+x)*4);
  assert.equal(changed.length,pixels.length);
  assert.deepEqual(changed.slice(0,4),pixels.slice(0,4));
  assert.equal(changed[at(40,67)+3],255);
  assert.ok(changed[at(40,67)+1]>pixels[at(40,67)+1]);
  assert.notEqual(changed[at(39,24)],pixels[at(39,24)]);
  assert.throws(()=>normalizeImageColor({retouch:{length:70,legs:{hip:.8,ankle:.3,x:.5,radius:.5}}}),/美颜/);
});

test('sampled HSL stores exact RGB and changes the sampled colour without selecting the whole red band',()=>{
  const rgb=[228,57,45],other=[131,30,26];
  const original=Uint8ClampedArray.of(...rgb,255,...other,255,128,128,128,255);
  const swatch=normalizeImageColor({hslSamples:[{rgb,adjustment:{}}]});
  assert.equal(hasImageColor(swatch),false);
  assert.deepEqual(swatch.hslSamples,[{rgb,adjustment:{}}]);
  const color=normalizeImageColor({hslSamples:[{rgb,adjustment:{lightness:60}}]});
  const adjusted=applyImageColor(original.slice(),color);
  assert.ok(adjusted[0]>228&&adjusted[1]>57);
  assert.deepEqual(adjusted.slice(4),original.slice(4));
  const gray=applyImageColor(original.slice(),{hslSamples:[{rgb:[128,128,128],adjustment:{lightness:-50}}]});
  assert.deepEqual([...gray.slice(8)],[77,77,77,255]);
  assert.throws(()=>normalizeImageColor({hslSamples:[{rgb},{rgb}]}),/重复/);
});

test('stretching the legs locks the region below the visible ankle in its original pixels',()=>{
  const width=9,height=250;
  const source=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>[Math.floor(i/width),50,10,255]).flat());
  const legs={hip:.38,ankle:.76,foot:.88,lock:.728,x:.5,core:.18,radius:.4};
  const color=normalizeImageColor({retouch:{legs,length:100}});
  const changed=applyImageColor(source.slice(),color,{width,height});
  const red=y=>changed[(y*width+4)*4];
  assert.ok(red(145)>145);
  assert.deepEqual(changed.slice(182*width*4),source.slice(182*width*4));
  assert.equal(red(45),45);
});

test('small head scales a localized head region, and liquify accepts an ordered brush path',()=>{
  const width=90,height=100;
  const source=Uint8ClampedArray.from(Array.from({length:height*width},(_,i)=>[(i%width)*2,Math.floor(i/width)*2,80,255]).flat());
  const head={x:.5,y:.25,rx:.18,ry:.14};
  const headOnly=normalizeImageColor({retouch:{head,headSize:90}});
  const centered=applyImageColor(source.slice(),headOnly,{width,height});
  const index=(x,y)=>(y*width+x)*4;
  assert.ok(centered[index(52,25)]>source[index(52,25)]);
  assert.equal(centered[index(52,65)],source[index(52,65)]);
  const path=[{x:.45,y:.27,dx:.014,dy:0,radius:.068,radiusY:.067},{x:.52,y:.32,dx:0,dy:.02,radius:.068,radiusY:.067}];
  const color=normalizeImageColor({retouch:{strokes:[{kind:'push',path}]}});
  const changed=applyImageColor(source.slice(),color,{width,height});
  assert.ok(changed[index(40,27)]<source[index(40,27)]);
  assert.ok(changed[index(46,32)+1]<source[index(46,32)+1]);
  assert.deepEqual(changed.slice(0,4),source.slice(0,4));
});

test('face slimming adjusts the upper and lower contours, and smoothing preserves a strong edge',()=>{
  const width=96,height=96;
  const face={x:.5,y:.5,rx:.24,ry:.31},frame={width,height};
  const image=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    return [x*2,y*2,110,255];
  }).flat());
  const at=(x,y)=>4*(y*width+x);
  const slim=applyImageColor(image.slice(),{retouch:{face,slim:100}},frame);
  assert.ok(slim[at(61,30)]>image[at(61,30)]);
  assert.ok(slim[at(61,67)]>image[at(61,67)]);
  assert.equal(slim[at(48,37)],image[at(48,37)]);
  const textured=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    const value=x<48?125+(x%3)*8+(y%3)*4:220;
    return [value,value,value,255];
  }).flat());
  const smooth=applyImageColor(textured.slice(),{retouch:{face,skin:100}},frame);
  assert.ok(smooth[at(42,45)]>textured[at(42,45)]);
  assert.equal(smooth[at(48,45)],220);
});

test('whole-head controls move both the crown and jaw and leave distant pixels fixed',()=>{
  const width=100,height=120;
  const source=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>[i%width,Math.floor(i/width),20,255]).flat());
  const head={x:.5,y:.35,rx:.20,ry:.22},frame={width,height};
  const changed=applyImageColor(source.slice(),normalizeImageColor({retouch:{head,headSize:100}}),frame);
  const row=y=>changed[(y*width+50)*4+1];
  assert.ok(row(19)<19&&row(65)>65);
  assert.equal(row(102),102);
});

test('new push strokes feather their contour on both sides of the tracked gesture',()=>{
  const width=160,height=140,frame={width,height};
  const source=Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>[i%width,Math.floor(i/width),20,255]).flat());
  const path=Array.from({length:7},(_,i)=>({x:.40+i*.023,y:.53,dx:.023,dy:0,radius:.105,radiusY:.12}));
  const color=normalizeImageColor({retouch:{strokes:[{kind:'push',path,soft:true}]}});
  assert.equal(color.retouch.strokes[0].soft,true);
  const changed=applyImageColor(source.slice(),color,frame);
  const shift=y=>80-changed[(y*width+80)*4];
  assert.ok(shift(74)>=4);
  assert.ok(shift(61)>0&&shift(88)>0);
  assert.ok(Math.abs(shift(61)-shift(88))<=2);
  assert.equal(shift(35),0);
});
