// Publish only after the formal release and every immutable attachment have
// been downloaded and compared. No private key is needed for channel updates.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {formalReleaseFromPage} from '../engine/update-discovery.mjs';import {decodeManifest,newer} from '../src/lite/updater.mjs';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version,repo=path.resolve(process.argv[2]||'.cache/release-channel'),base='https://gitee.com/a1meon_admin/halframe-releases/';
const out=path.resolve('release/remote-v'+version.replaceAll('.','')),proof=JSON.parse(await fs.readFile(path.join(out,'download-verification.json'),'utf8'));
if(proof.version!==version||!proof.anonymousDownload||!proof.byteEqualToLocal||proof.files.length<20)throw Error('Full anonymous release verification is required before publishing stable');
function git(args){const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
if(git(['remote','get-url','origin'])!=='https://gitee.com/a1meon_admin/halframe-releases.git'||git(['rev-parse','--show-toplevel'])!==repo)throw Error('Wrong stable channel repository');
if(git(['status','--porcelain']))throw Error('Stable channel checkout has pending changes');
const response=await fetch(base+'releases/latest',{headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw Error('Cannot confirm formal release');const release=formalReleaseFromPage(await response.text(),base);if(release.version!==version)throw Error('Stable publication requires this version to be latest formal');
const prepared=[];
for(const [platform,arch]of [['darwin','arm64'],['darwin','x64'],['win32','x64']]){
 const source=`${platform==='darwin'?'lite-auto':'lite'}-${platform}-${arch}.json`,file=await fs.readFile(path.join(out,source)),entry=proof.files.find(f=>f.name===source);
 if(!entry||entry.sha256!==createHash('sha256').update(file).digest('hex'))throw Error('Verified metadata mismatch');const manifest=decodeManifest(JSON.parse(file),platform,arch);if(manifest.version!==version)throw Error('Wrong stable version');
 const destination=path.join(repo,'updates/stable',`lite-${platform}-${arch}.json`);let old;try{old=decodeManifest(JSON.parse(await fs.readFile(destination,'utf8')),platform,arch);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(old&&newer(old.version,version))throw Error('Stable channel downgrade refused');prepared.push([destination,file]);
}
await fs.mkdir(path.join(repo,'updates/stable'),{recursive:true});for(const [destination,file]of prepared)await fs.writeFile(destination,file);
git(['add','updates/stable']);if(git(['diff','--cached','--name-only']))git(['commit','-m','Publish verified stable update channel '+version]);git(['push','origin','HEAD:main']);console.log(JSON.stringify({version,stableCommit:git(['rev-parse','HEAD']),signedPlatforms:prepared.length,apiRequired:false}));
