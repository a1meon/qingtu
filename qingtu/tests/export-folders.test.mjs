import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadExportFolders} from '../engine/export-folders.mjs';
import 'fake-indexeddb/auto';
import {recordDownload,downloads} from '../src/browser-download-history.js';
async function temp(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-export-history-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}

test('every saved file retains its own folder across restarts; missing files and folders disable only their rows',async t=>{
 const root=await temp(t),a=path.join(root,'one'),b=path.join(root,'two');
 await Promise.all([fs.mkdir(a),fs.mkdir(b)]);
 const first=path.join(a,'photo.png'),second=path.join(b,'photo.png'),third=path.join(b,'photo-2.png');
 await Promise.all([first,second,third].map(f=>fs.writeFile(f,'test')));
 const history=await loadExportFolders(root);
 await Promise.all([history.record('compression',first),history.record('compression',second),history.record('stitch',third)]);
 const reopened=await loadExportFolders(root),{items}=await reopened.list('compression');
 assert.deepEqual(items.map(e=>[e.name,e.folder,e.status]),[['photo.png',b,'available'],['photo.png',a,'available']]);
 assert.equal(await reopened.folderFor('compression',items[1].id),a);
 await assert.rejects(reopened.folderFor('stitch',items[0].id),/找不到/);
 await fs.unlink(first);
 assert.deepEqual((await reopened.list('compression')).items.map(e=>e.status),['available','missing']);
 await assert.rejects(reopened.folderFor('compression',items[1].id),/删除或移动/);
 await fs.rename(b,b+'-moved');assert.equal((await reopened.list('stitch')).items[0].status,'missing');
});
test('a legacy folder is restored without inventing files; all paged history survives interrupted lines',async t=>{
 const root=await temp(t),dir=path.join(root,'export-history');await fs.mkdir(dir);
 await fs.writeFile(path.join(dir,'stitch.json'),JSON.stringify(root));
 const history=await loadExportFolders(root);assert.equal(history.get('stitch'),root);assert.equal((await history.list('stitch')).total,0);
 await fs.writeFile(path.join(dir,'stitch.jsonl'),'{"unfinished"');
 for(let n=0;n<31;n++)await history.record('stitch',path.join(root,n+'.png'));
 const restored=await loadExportFolders(root),first=await restored.list('stitch'),second=await restored.list('stitch',1);
 assert.equal(first.total,31);assert.equal(first.items.length,30);assert.equal(first.items[0].name,'30.png');assert.equal(second.items[0].name,'0.png');
});
test('renaming the default affects future exports while retaining history and explicit folder choices',async t=>{
 const root=await temp(t),pictures=path.join(root,'my-pictures');
 const oldDefault=path.join(pictures,'轻图导出'),custom=path.join(root,'client','轻图导出');
 const file=path.join(oldDefault,'旧图.png');
 await fs.mkdir(oldDefault,{recursive:true});await fs.writeFile(file,'test');
 const history=await loadExportFolders(root);
 await history.record('stitch',file);
 await history.record('compression',path.join(custom,'图.png'));
 const upgraded=await loadExportFolders(root);
 assert.equal(upgraded.customFolder('stitch',pictures),null);
 const [entry]=(await upgraded.list('stitch')).items;
 assert.equal(await upgraded.folderFor('stitch',entry.id),oldDefault);
 assert.equal(upgraded.customFolder('compression',pictures),custom);
 await upgraded.record('stitch',file,false);
 await upgraded.record('compression',path.join(pictures,'轻图output','新图.png'),true);
 const reopened=await loadExportFolders(root);
 assert.equal(reopened.customFolder('stitch',pictures),oldDefault);
 assert.equal(reopened.customFolder('compression',path.join(root,'relocated-pictures')),null);
});
test('browser download records retain per-module names and pagination without claiming access to files',async()=>{
 for(let n=0;n<31;n++)await recordDownload('stitch',n+'.png');
 await recordDownload('compression','small.jpg');
 const {items,total}=await downloads('stitch');assert.equal(total,31);assert.equal(items[0].name,'30.png');assert.equal(items[0].status,'download');
 assert.equal((await downloads('stitch',1)).items[0].name,'0.png');assert.equal((await downloads('compression')).total,1);
});
