// Development-only toolchains. None of these archives is shipped with Qingtu.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const files=[
 ['.cache/lite-probe/neutralino.zip','https://github.com/neutralinojs/neutralinojs/releases/download/v6.10.0/neutralinojs-v6.10.0.zip','e633f480737f229f582d8ec6165a52d789340950aef062560702122389f08329'],
 ['.cache/lite-go/go.tar.gz','https://go.dev/dl/go1.27.2.darwin-arm64.tar.gz','76812b213b1b2302c978d28fa52fa92d541704b9e7d9d5db8002c50e4018c4c5'],
 ['.cache/lite-probe/MicrosoftEdgeWebview2Setup.exe','https://go.microsoft.com/fwlink/p/?LinkId=2124703','90ae8eb0d9d22d6e51fccde49e4d25d266ff9343ad0cc931faa6f482569cea62']
];
for(const [file,url,expected]of files){await fs.mkdir(path.dirname(file),{recursive:true});let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;const r=await fetch(url);if(!r.ok)throw new Error('Download failed: '+r.status);bytes=Buffer.from(await r.arrayBuffer());}if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Pinned tool checksum changed: '+file);await fs.writeFile(file,bytes);}
for(const [command,args]of [['unzip',['-oq','.cache/lite-probe/neutralino.zip','-d','.cache/lite-probe/neutralino']],['tar',['-xzf','.cache/lite-go/go.tar.gz','-C','.cache/lite-go']]]){const r=spawnSync(command,args,{stdio:'inherit'});if(r.status!==0)throw new Error('Tool extraction failed');}
console.log('Pinned lightweight build tools verified.');
