import test from 'node:test';
import assert from 'node:assert/strict';
import {performOptimization} from '../src/stitch/optimization.js';
import {exportProjectIds} from '../src/stitch/project-export.js';
import {optimizeHorizontal} from '../engine/stitch-optimize.mjs';
const project=()=>({id:'one',layout:'horizontal',images:[{id:'a',width:300,height:400},{id:'b',width:300,height:400},{id:'c',width:900,height:1600},{id:'d',width:900,height:1600}],export:{longEdge:5999,targetBytes:10000000,format:'png'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('optimization waits for committed autosave, then the real engine; no successful progress on premature completion',async()=>{
 const events=[],saved=deferred(),encoded=deferred(),p=project();
 const work=performOptimization({project:p,onPhase:phase=>events.push(phase),save:async next=>{assert.equal(next.export.longEdge,5995);await saved.promise;events.push('saved');},render:async()=>{events.push('engine');await encoded.promise;return {bytes:321};}});
 assert.deepEqual(events,['calculate','save']);saved.resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(events,['calculate','save','saved','render','engine']);
 let complete=false;work.then(()=>complete=true);await new Promise(r=>setImmediate(r));assert.equal(complete,false);encoded.resolve();assert.equal((await work).result.bytes,321);assert.equal(p.edits,undefined);
});
test('repeated optimization reuses the ready result with no autosave/encode; failed save never starts encoding',async()=>{
 const p=optimizeHorizontal(project()),reuse={width:5995,height:2398},phases=[];
 const value=await performOptimization({project:p,reuse,onPhase:phase=>phases.push(phase),save:()=>assert.fail('duplicate save'),render:()=>assert.fail('duplicate encode')});assert.equal(value.result,reuse);assert.deepEqual(phases,['calculate']);
 await assert.rejects(performOptimization({project:project(),onPhase:()=>{},save:()=>Promise.reject(new Error('Disk full')),render:()=>assert.fail('encode after failed save')}),/Disk full/);
 await assert.rejects(performOptimization({project:project(),onPhase:()=>{},save:async()=>{},render:()=>Promise.reject(new Error('增加上限'))}),/增加上限/);
});
test('all-project export skips empty canvases and counts the active unsaved state without importing any previews',()=>{
 const projects=[{id:'one',count:4},{id:'two',count:0},{id:'three',count:1}];
 assert.deepEqual(exportProjectIds(projects,{id:'two',images:[{id:'new'}]}),['one','two','three']);
 assert.deepEqual(exportProjectIds(projects,{id:'one',images:[]}),['three']);
 assert.deepEqual(exportProjectIds([{id:'empty',count:0}],null),[]);
});
