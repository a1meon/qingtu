import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {db,request,finished,commitProject,readAsset,deleteProjects} from '../src/stitch/database.js';

const get=async id=>request((await db()).transaction('projects').objectStore('projects').get(id));
test('concurrent saves preserve the winning revision and the losing editor can keep its own copy',async()=>{
 const id='draft',doc={id,images:[],name:'original'},files=new Map();
 await commitProject(doc,null,files);
 const edits=['first','second'].map(name=>({...doc,name}));
 const results=await Promise.allSettled(edits.map(value=>commitProject(value,1,files)));
 const rejected=results.findIndex(r=>r.status==='rejected'),winner=1-rejected;
 assert.equal(results[winner].status,'fulfilled');assert.equal(results[rejected].reason.code,'PROJECT_CONFLICT');
 assert.equal((await get(id)).name,edits[winner].name);
 await commitProject({...edits[rejected],id:'copy'},null,files);
 assert.equal((await get('copy')).name,edits[rejected].name);
});
test('stale deletes are atomic and omit documents absent from the confirmed selection',async()=>{
 const files=new Map(),a={id:'a',images:[]},b={id:'b',images:[]};
 await commitProject(a,null,files);await commitProject(b,null,files);await commitProject({...b,name:'new'},1,files);
 await assert.rejects(deleteProjects([{id:'a',revision:1},{id:'b',revision:1}]),/另一页面/);
 assert.ok(await get('a'));assert.equal((await get('b')).name,'new');
 await deleteProjects([{id:'a',revision:1}]);assert.equal(await get('a'),undefined);assert.ok(await get('b'));
});
test('shared originals survive layer edits and a stale tab can restore a deleted original into a copy',async()=>{
 const file=new Blob(['original bytes']),assetId='source',files=new Map([[assetId,file]]);
 const first={id:'first',images:[{assetId}]},second={...first,id:'second'};
 await commitProject(first,null,files);await commitProject(second,null,new Map());
 await commitProject({...first,images:[]},1,new Map());assert.equal(await (await readAsset(assetId)).text(),'original bytes');
 await deleteProjects([{id:'second',revision:1}]);assert.equal(await readAsset(assetId),undefined);
 await assert.rejects(commitProject(second,1,files),{code:'PROJECT_CONFLICT'});
 await commitProject({...second,id:'restored'},null,files);assert.equal(await (await readAsset(assetId)).text(),'original bytes');
});
test('older projects without a revision can be saved once with revision zero',async()=>{
 const legacy={id:'legacy',images:[]};
 const tx=(await db()).transaction('projects','readwrite'),done=finished(tx);tx.objectStore('projects').put(legacy);await done;
 assert.equal((await commitProject(legacy,0,new Map())).revision,1);
 await assert.rejects(commitProject(legacy,0,new Map()),{code:'PROJECT_CONFLICT'});
});
