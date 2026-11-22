// Copy an already verified, public CNB release. Only publish the GitHub draft
// after its stored assets match the source byte for byte.
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const {createReadStream,createWriteStream} = require('node:fs');
const {pipeline} = require('node:stream/promises');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');
const semver = require('semver');
const config = require('../desktop/update-source.json');
const {releaseHosts} = require('../desktop/update-source.cjs');
const {decodeEnvelope} = require('../desktop/mac-updater.cjs');
const {validateArchive} = require('../desktop/chunk-download.cjs');

function checksums(text) {
  const sums = new Map();
  for (const line of text.trimEnd().split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/i.exec(line);
    if (!match || sums.has(match[2])) throw new Error('无效或重复的 SHA-256 条目');
    sums.set(match[2], match[1].toLowerCase());
  }
  return sums;
}

function requiredFiles(version, windows, macs, base) {
  const names = new Set(['stable.json','latest.yml','mac-arm64.json','mac-x64.json', ...['arm64','x64'].map(a => 'Qingtu-' + version + '-mac-' + a + '.dmg')]);
  if (windows.version !== version || windows.files?.length !== 1) throw new Error('Windows 清单版本或文件列表不匹配');
  for (const [suffix, file] of [['win-x64.exe', windows.files[0]], ...['arm64','x64'].map(arch => {
    const manifest = macs[arch];
    if (manifest.arch !== arch || manifest.version !== version) throw new Error('Mac 清单版本或架构不匹配');
    return ['mac-' + arch + '.zip', manifest.file];
  })]) {
    if (file.url !== 'Qingtu-' + version + '-' + suffix) throw new Error('安装包名称与平台不符');
    if (file.qingtuParts !== undefined) throw new Error('本版只发布完整安装包');
    validateArchive(file,base);
    names.add(file.url);
    if (file.qingtuDelta) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.qtdelta$/.test(file.qingtuDelta.url)) throw new Error('增量包名称无效');
      names.add(file.qingtuDelta.url);
    }
  }
  return names;
}

function sameAssets(expected, actual) {
  if (expected.size !== actual.size || [...expected].some(name => !actual.has(name))) throw new Error('附件清单不完整或有额外附件');
}

async function response(url) {
  const res = await fetch(url, {signal:AbortSignal.timeout(1200000),headers:{'User-Agent':'qingtu-release'}});
  if (!res.ok || new URL(res.url).protocol !== 'https:') throw new Error('附件或发行信息下载失败 ' + res.status + ' ' + url);
  return res;
}

async function downloadOnce(url, target) {
  const hash = createHash('sha256');
  const body = (await response(url)).body;
  await pipeline(body, async function* (stream) {
    for await (const bytes of stream) { hash.update(bytes); yield bytes; }
  }, createWriteStream(target));
  return hash.digest('hex');
}

async function download(url, target) {
  const name = path.basename(target);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const hash = await downloadOnce(url, target);
      console.log('Verified transfer ' + name + ' from ' + new URL(url).hostname);
      return hash;
    } catch (error) {
      if (attempt === 3) throw new Error('下载失败 ' + url + ' (' + (error.cause?.code || error.message) + ')');
      console.warn('Retrying ' + name + ' after ' + (error.cause?.code || error.message));
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}

async function verifyPayload(dir, file) {
  const verify = async part => {
    const hash = createHash('sha512');
    let size = 0;
    for await (const bytes of createReadStream(path.join(dir,part.url))) {
      size += bytes.length;
      hash.update(bytes);
    }
    if (size !== part.size || hash.digest('base64') !== part.sha512) throw new Error('完整包或补丁校验失败 ' + part.url);
  };
  await verify(file);
  if (file.qingtuDelta) await verify(file.qingtuDelta);
}

async function mirror(tag, verifyOnly = false) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || !semver.gt(tag,'0.4.9')) throw new Error('双发从 v0.4.9 之后的正式版本开始');
  const version = tag.slice(1);
  const [cnb, github] = releaseHosts(config);
  const project = config.mirrors.find(mirror => mirror.provider === 'github');
  const repo = project.owner + '/' + project.repo;
  const base = cnb.downloads + tag + '/';
  const release = await (await response(base+'stable.json')).json();
  if (release.tag_name !== tag) throw new Error('CNB 发布标记与标签不匹配');
  const sumFile = 'SHA256SUMS-' + version + '.txt';
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'qingtu-release-'));
  const gh = args => execFileSync('gh', args, {encoding:'utf8',maxBuffer:32*1024*1024});
  const releases = () => JSON.parse(gh(['api','--paginate','--slurp','repos/' + repo + '/releases?per_page=100'])).flat();
  const find = () => releases().find(r => r.tag_name === tag);
  try {
    const sumHash = await download(base + sumFile, path.join(temp,sumFile));
    const sumSig=sumFile+'.sig';
    const sigHash=await download(base+sumSig,path.join(temp,sumSig));
    const data=await fs.readFile(path.join(temp,sumFile));
    const {verifyReleaseSignature}=require('./release-key.cjs');
    verifyReleaseSignature(data,await fs.readFile(path.join(temp,sumSig),'utf8'));
    const sums=checksums(data.toString('utf8'));
    for (const [name, digest] of sums) {
      if (await download(base + name,path.join(temp,name)) !== digest) throw new Error('CNB 附件校验失败 ' + name);
    }
    const macs = {};
    for (const arch of ['arm64','x64']) {
      const envelope = JSON.parse(await fs.readFile(path.join(temp,'mac-' + arch + '.json'),'utf8'));
      macs[arch] = decodeEnvelope(envelope,require('../desktop/sparkle-public-key.json').publicKey,arch,base);
    }
    const windows = yaml.load(await fs.readFile(path.join(temp,'latest.yml'),'utf8'));
    require('../desktop/windows-manifest.cjs').verifyWindowsManifest(windows);
    sameAssets(requiredFiles(version,windows,macs,base),new Set(sums.keys()));
    for (const file of [windows.files[0],macs.arm64.file,macs.x64.file]) await verifyPayload(temp,file);
    sums.set(sumFile,sumHash);sums.set(sumSig,sigHash);
    if (!verifyOnly) {
      let dest = find();
      if (!dest) {
        gh(['release','create',tag,'--repo',repo,'--verify-tag','--draft','--title','轻图 '+version,'--notes-file',path.join(__dirname,'..','docs','releases',tag+'.md')]);
        dest = find();
      }
      if (!dest || dest.prerelease) throw new Error('GitHub 发行状态异常');
      const existing = new Map(dest.assets.map(a => [a.name,a]));
      for (const [name, asset] of existing) {
        if (!sums.has(name) || asset.state !== 'uploaded' || asset.digest !== 'sha256:' + sums.get(name)) throw new Error('GitHub 已有不同的附件 ' + name);
      }
      for (const name of sums.keys()) {
        if (existing.has(name)) continue;
        if (!dest.draft) throw new Error('已公开版本缺少附件 ' + name);
        gh(['release','upload',tag,path.join(temp,name),'--repo',repo]);
      }
      if (dest.draft) {
        const uploaded = find()?.assets || [];
        sameAssets(new Set(sums.keys()), new Set(uploaded.map(a => a.name)));
        if (uploaded.some(a => a.state !== 'uploaded' || a.digest !== 'sha256:' + sums.get(a.name))) throw new Error('GitHub 草稿附件校验失败');
        gh(['release','edit',tag,'--repo',repo,'--draft=false']);
      }
    }
    const published = await (await response(github.api.replace(/latest$/, 'tags/' + tag))).json();
    if (published.tag_name !== tag || published.draft || published.prerelease) throw new Error('GitHub 正式版尚未公开');
    sameAssets(new Set(sums.keys()),new Set(published.assets.map(a => a.name)));
    for (const [name, digest] of sums) {
      if (await download(github.downloads + tag + '/' + name,path.join(temp,name)) !== digest) throw new Error('GitHub 匿名下载校验失败 ' + name);
    }
    for (const host of [cnb,github]) {
      if ((await (await response(host.api)).json()).tag_name !== tag) throw new Error('最新版本入口尚未指向 ' + tag);
    }
    console.log(tag + ' 双源校验通过，共 ' + sums.size + ' 个附件。');
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}
module.exports = {checksums,requiredFiles,sameAssets,verifyPayload};
if (require.main === module) mirror(process.argv[2],process.argv[3] === '--verify-only').catch(error => {
  console.error(error.message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = error.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error('::error title=Release mirror::' + message);
  }
  process.exitCode = 1;
});
