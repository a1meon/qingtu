import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {decodeManifest} from '../src/lite/updater.mjs';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const version=JSON.parse(await fs.readFile('package.json','utf8')).version,out=process.argv[2]||'release/lite-'+version;
const sum=await fs.readFile(out+'/SHA256SUMS-'+version+'.txt','utf8');let count=0,total=Buffer.byteLength(sum);
for(const line of sum.trim().split('\n')){const expected=line.slice(0,64),name=line.slice(66),bytes=await fs.readFile(path.join(out,name));if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Checksum mismatch '+name);total+=bytes.length;count++;}
for(const [platform,arch]of [['darwin','arm64'],['darwin','x64'],['win32','x64']]){const m=decodeManifest(JSON.parse(await fs.readFile(`${out}/lite-${platform}-${arch}.json`,'utf8')),platform,arch);const b=await fs.readFile(path.join(out,m.file.name));if(m.file.size!==b.length||createHash('sha256').update(b).digest('hex')!==m.file.sha256)throw new Error('Manifest mismatch');}
for(const [platform,arch]of [['darwin','arm64'],['darwin','x64'],['win32','x64']]){
 const file=platform==='darwin'?`.cache/lite-build/darwin-${arch}/轻图.app/Contents/Resources/resources.neu`:'.cache/lite-build/win32-x64/resources.neu';
 const names=asar.listPackage(file);if(names.some(n=>/node_modules|\.pem$|\.key$|fixture|samples\//i.test(n)))throw new Error('Unexpected package resources');if(!names.includes('/resources/vips/vips.wasm'))throw new Error('WASM engine missing');
}
const currentRemoteBytes=process.env.QINGTU_CURRENT_REMOTE_BYTES===undefined?null:Number(process.env.QINGTU_CURRENT_REMOTE_BYTES);if(currentRemoteBytes!==null&&(!Number.isSafeInteger(currentRemoteBytes)||currentRemoteBytes<0))throw new Error('Invalid remote size');
console.log(JSON.stringify({version,files:count+1,bytes:total,currentRemoteBytes,projectedRemoteBytes:currentRemoteBytes===null?null:currentRemoteBytes+total,quotaBytes:1000000000,spaceEnough:currentRemoteBytes===null?null:currentRemoteBytes+total<1000000000},null,2));
