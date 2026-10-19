import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {NtExecutable,NtExecutableResource} from 'resedit';
import {applyWindowManifest} from '../scripts/windows-window-manifest.mjs';
const input=NtExecutable.createEmpty(false,false);
const resources=NtExecutableResource.from(input);
resources.entries.push({type:24,id:1,lang:1033,codepage:0,bin:new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo></assembly>`).buffer});
resources.outputResource(input);
test('Windows manifest declares DPI before any HWND exists and preserves ordinary user permissions',()=>{
 const output=Buffer.from(applyWindowManifest(Buffer.from(input.generate()))),exe=NtExecutable.from(output),manifest=Buffer.from(NtExecutableResource.from(exe).entries.find(e=>e.type===24).bin).toString();
 assert.match(manifest,/<dpiAwareness[^>]*>PerMonitorV2,PerMonitor<\/dpiAwareness>/);
 assert.match(manifest,/<dpiAware[^>]*>true\/pm<\/dpiAware>/);
 assert.match(manifest,/level="asInvoker" uiAccess="false"/);
 assert.deepEqual(Buffer.from(applyWindowManifest(output)),output,'manifest patch is idempotent');
});
test('pinned runtime code, imports, relocation bytes and section addresses survive manifest resource editing',{skip:!fs.existsSync('.cache/lite-probe/neutralino/neutralino-win_x64.exe')},()=>{
 const bytes=fs.readFileSync('.cache/lite-probe/neutralino/neutralino-win_x64.exe'),before=NtExecutable.from(bytes),after=NtExecutable.from(applyWindowManifest(bytes));
 const original=before.getAllSections().filter(s=>s.info.name!=='.rsrc'),updated=after.getAllSections().filter(s=>s.info.name!=='.rsrc');
 assert.equal(updated.length,original.length);
 for(let i=0;i<original.length;i++){assert.equal(updated[i].info.name,original[i].info.name);assert.equal(updated[i].info.virtualAddress,original[i].info.virtualAddress);assert.deepEqual(Buffer.from(updated[i].data||[]),Buffer.from(original[i].data||[]),original[i].info.name);}
 const entry=data=>data.readUInt32LE(data.readUInt32LE(60)+24+16);assert.equal(entry(Buffer.from(applyWindowManifest(bytes))),entry(bytes));
});
