import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberCanvasLayout,switchCanvasLayout,validateLayoutStates} from '../engine/canvas-layout-state.mjs';
import {CANVAS_PRESETS,presetCanvas,canvasPresetValue} from '../engine/canvas-presets.mjs';
import {appendProjectImages,removeProjectImage,resetProject} from '../engine/stitch-reset.mjs';
import {setImageEdit} from '../engine/stitch-edits.mjs';
import {splitProjectImage,fullSourcePosition} from '../engine/stitch-split.mjs';
import {validateCanvas} from '../engine/canvas-limits.mjs';
const image=id=>({id,assetId:'a'.repeat(64),name:id,width:300,height:400,bytes:100});
const project=()=>appendProjectImages({canvasMode:'fixed',canvas:{width:1200,height:480},layout:'horizontal',images:[],initialOrder:[],positions:{},edits:{},grid:{rows:2,columns:2},export:{format:'png',targetBytes:10000000}},['a','b','c','d'].map(image));
const near=(a,b)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1e-9,`${key}: ${a[key]} != ${b[key]}`);};

test('each layout restores its own moved, stretched and off-canvas poses instead of arranging again',()=>{
 let p=project();p.positions.a={x:-20,y:35,width:320,height:410};const horizontal=structuredClone(p.positions),saved={horizontal};
 for(const type of ['grid','vertical','free']){p=switchCanvasLayout(p,type);p.positions={...p.positions,a:{x:13*type.length,y:-7*type.length,width:500+type.length,height:333}};saved[type]=structuredClone(p.positions);}
 for(const type of ['horizontal','grid','vertical','free','horizontal']){p=switchCanvasLayout(p,type);for(const id of Object.keys(saved[type]))near(p.positions[id],saved[type][id]);assert.deepEqual(p.canvas,{width:1200,height:480});}
 assert.equal(switchCanvasLayout(p,'horizontal'),p,'active layout click is a no-op');
});
test('visiting an empty layout does not invent remembered positions for later imports',()=>{
 let p={...project(),images:[],initialOrder:[],positions:{}};p=switchCanvasLayout(p,'grid');p=switchCanvasLayout(p,'horizontal');assert.deepEqual(p.layoutStates,{});
 p=rememberCanvasLayout(appendProjectImages(p,['a','b','c','d'].map(image)));p=switchCanvasLayout(p,'grid');assert.ok(p.positions.c.y>p.positions.a.y,'first populated grid visit arranges rows');
});
test('global crop and reset preserve each remembered layout source scale and centre without restoring obsolete edits',()=>{
 let p=project();p.positions.a={x:-80,y:10,width:300,height:500};p=switchCanvasLayout(p,'grid');const gridFull=fullSourcePosition(p,'a');
 p=rememberCanvasLayout(setImageEdit(p,'a',{axis:'horizontal',amount:40}));p=switchCanvasLayout(p,'horizontal');assert.deepEqual(p.edits.a,{axis:'horizontal',amount:40});near(fullSourcePosition(p,'a'),{x:-80,y:10,width:300,height:500});
 p=resetProject(p);p=switchCanvasLayout(p,'grid');assert.deepEqual(p.edits,{});near(p.positions.a,gridFull);
});
test('new imports append in remembered layouts and deleted images never reappear on switches',()=>{
 let p=switchCanvasLayout(project(),'grid'),gridA={...p.positions.a};p=switchCanvasLayout(p,'horizontal');
 p=rememberCanvasLayout(appendProjectImages(p,[image('new')]));p=switchCanvasLayout(p,'grid');near(p.positions.a,gridA);const right=Math.max(...p.images.filter(i=>i.id!=='new').map(i=>p.positions[i.id].x+p.positions[i.id].width));assert.equal(p.positions.new.x,right);
 p=removeProjectImage(p,'a');validateLayoutStates(p);p=switchCanvasLayout(p,'horizontal');assert.equal(p.positions.a,undefined);assert.equal(p.images.some(i=>i.id==='a'),false);assert.equal(p.layoutStates.grid.a,undefined);
});
test('splits replace the source in every remembered layout at that layout source position',()=>{
 let p=switchCanvasLayout(project(),'grid'),grid=fullSourcePosition(p,'a');p=switchCanvasLayout(p,'horizontal');const horizontal=fullSourcePosition(p,'a');
 p=rememberCanvasLayout(splitProjectImage(p,'a','x',110,['left','right']));validateLayoutStates(p);
 for(const [mode,source] of [['grid',grid],['horizontal',horizontal]]){p=switchCanvasLayout(p,mode);const a=p.positions.left,b=p.positions.right;near(a,{...source,width:source.width*110/300});near(b,{x:source.x+a.width,y:source.y,width:source.width-a.width,height:source.height});assert.equal(p.positions.a,undefined);}
});
test('malformed stored layout state is rejected before it can replace a committed project',()=>{
 const p=rememberCanvasLayout(project());for(const layoutStates of [null,[],{unknown:{}},{horizontal:{missing:{x:0,y:0,width:1,height:1}}},{horizontal:{a:{x:0,y:0,width:0,height:1}}},{horizontal:{a:{x:Infinity,y:0,width:1,height:1}}}])assert.throws(()=>validateLayoutStates({...p,layoutStates}),/布局记忆/);
 assert.doesNotThrow(()=>validateLayoutStates(p));
});
test('canvas presets use exact approved ratios at maximum legal integer resolution',()=>{
 assert.deepEqual(CANVAS_PRESETS.map(p=>[p.label,p.width,p.height]),[['2.5:1',5995,2398],['21:9',5999,2571],['16:9',5984,3366],['4:3',5996,4497],['1:1',5999,5999]]);
 for(const preset of CANVAS_PRESETS){validateCanvas(preset.width,preset.height);assert.equal(canvasPresetValue(presetCanvas(preset.value)),preset.value);}
 assert.equal(canvasPresetValue({width:600,height:240}),'5:2');assert.equal(canvasPresetValue({width:600,height:400}),'custom');assert.throws(()=>presetCanvas('invalid'),/预设/);
});
