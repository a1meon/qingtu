const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const yaml=require('js-yaml');const {createHash}=require('node:crypto');
const {splitRelease}=require('../scripts/prepare-chunk-release.cjs');
test('publisher creates bounded ordered attachments and preserves the full installer digest',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-release-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const bytes=Buffer.from('abcdefghij');const sha512=createHash('sha512').update(bytes).digest('base64');
 await fs.writeFile(path.join(dir,'Qingtu-0.4.3-win-x64.exe'),bytes);await fs.writeFile(path.join(dir,'latest.yml'),yaml.dump({version:'0.4.3',files:[{url:'Qingtu-0.4.3-win-x64.exe',size:10,sha512}]}));
 const result=await splitRelease(path.join(dir,'latest.yml'),path.join(dir,'publish'),4);const info=yaml.load(await fs.readFile(result.metadata,'utf8'));
 assert.equal(info.files[0].sha512,sha512);assert.deepEqual(info.files[0].qingtuParts.map(p=>p.size),[4,4,2]);
 const script=await fs.readFile(result.bootstrap,'utf8');assert.match(script,/github.com\/a1meon\/qingtu/);assert.match(script,/cnb.cool\/a1meon/);
 const parts=[];for(const part of info.files[0].qingtuParts)parts.push(await fs.readFile(path.join(dir,'publish',part.url)));assert.ok(Buffer.concat(parts).equals(bytes));
 assert.ok((await fs.readFile(result.bootstrap,'utf8')).includes(sha512.toUpperCase())|| (await fs.readFile(result.bootstrap,'utf8')).includes(Buffer.from(sha512,'base64').toString('hex').toUpperCase()));
});
test('publisher refuses mismatched build metadata before announcing an installable release',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-release-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.writeFile(path.join(dir,'test.exe'),'abcdef');await fs.writeFile(path.join(dir,'latest.yml'),yaml.dump({version:'0.4.3',files:[{url:'test.exe',size:6,sha512:createHash('sha512').update('wrong').digest('base64')}]}));
 await assert.rejects(splitRelease(path.join(dir,'latest.yml'),path.join(dir,'publish'),4),/校验/);
 await assert.rejects(fs.access(path.join(dir,'publish','latest.yml')));
});
