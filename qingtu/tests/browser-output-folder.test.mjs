import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBrowserFolder,initialBrowserFolder,prepareBrowserFolder} from '../src/browser-output-folder.js';

test('the browser default is created under the authorized Pictures folder only on export',async t=>{
 const output={name:'轻图output'},pictures={name:'Pictures',getDirectoryHandle:t.mock.fn(async()=>output)};
 const picker=t.mock.fn(async()=>pictures);
 globalThis.window={showDirectoryPicker:picker};t.after(()=>delete globalThis.window);
 const initial=initialBrowserFolder();
 assert.equal(initial.path,'图片/轻图output');assert.equal(picker.mock.callCount(),0);
 assert.deepEqual(await prepareBrowserFolder('stitch',initial),{path:'Pictures/轻图output',directory:output});
 assert.deepEqual(picker.mock.calls[0].arguments,[{id:'qingtu-stitch',startIn:'pictures',mode:'readwrite'}]);
 assert.deepEqual(pictures.getDirectoryHandle.mock.calls[0].arguments,['轻图output',{create:true}]);
 window.showDirectoryPicker=async()=>output;
 assert.equal((await prepareBrowserFolder('stitch',initial)).directory,output);
});

test('an explicit browser choice is the destination itself and cancellation keeps the previous choice',async t=>{
 const chosen={name:'自选',requestPermission:t.mock.fn(async()=>'granted')};
 globalThis.window={showDirectoryPicker:async()=>chosen};t.after(()=>delete globalThis.window);
 const folder=await chooseBrowserFolder('compression',initialBrowserFolder());
 assert.deepEqual(await prepareBrowserFolder('compression',folder),{path:'自选',directory:chosen});
 window.showDirectoryPicker=async()=>{throw new DOMException('取消','AbortError');};
 assert.equal(await chooseBrowserFolder('compression',folder),null);
 assert.equal(await prepareBrowserFolder('stitch',initialBrowserFolder()),null);
});
