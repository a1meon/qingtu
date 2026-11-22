const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {gunzipSync} = require('node:zlib');
const semver = require('semver');
const {buildBlockMap} = require('app-builder-lib/out/targets/blockmap/blockmap');
const {computeOperations, OperationKind} = require('electron-updater/out/differentialDownloader/downloadPlanBuilder');
const {MAGIC, LITERAL, MAX_PATCH, MAX_OPERATIONS, applyDelta} = require('../desktop/update-delta.cjs');
const {fileDigest} = require('../desktop/chunk-download.cjs');

const artifactName = /^Qingtu-(\d+\.\d+\.\d+)-(mac-(?:arm64|x64)\.zip|win-x64\.exe)$/;
async function localBaseline(target) {
  const match = artifactName.exec(path.basename(target));
  if (!match) return;
  const candidates = (await fs.readdir(path.dirname(target))).map(name => artifactName.exec(name))
    .filter(other => other && other[2] === match[2] && semver.lt(other[1], match[1]))
    .sort((a, b) => semver.rcompare(a[1], b[1]));
  if (candidates.length) return {archive:path.join(path.dirname(target), candidates[0][0]), version:candidates[0][1]};
}

// A clean release runner can recover the last published artifact from the
// existing multipart feed. Only the build machine needs this full download.
async function releaseBaseline(target) {
  const match = artifactName.exec(path.basename(target));
  if (!match) return;
  if (process.env.QINGTU_DELTA_BASE) {
    const archive = path.resolve(process.env.QINGTU_DELTA_BASE);
    const old = artifactName.exec(path.basename(archive));
    if (!old || old[2] !== match[2] || !semver.lt(old[1], match[1])) throw new Error('增量基线版本或架构不匹配');
    return {archive, version:old[1]};
  }
  const local = await localBaseline(target);
  if (local) return local;
  const {resolveUpdateFeed,fromMirrors,preferredUrls} = require('../desktop/update-source.cjs');
  const {decodeEnvelope} = require('../desktop/mac-updater.cjs');
  const {assembleParts} = require('../desktop/chunk-download.cjs');
  const platform = match[2].startsWith('mac-') ? 'darwin' : 'win32';
  const arch = match[2].includes('-arm64') ? 'arm64' : 'x64';
  try {
    let config;
    try { config = JSON.parse(await fs.readFile('build/update-source.json','utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; config = require('../desktop/update-source.json'); }
    if (config.provider !== 'gitee') return;
    async function metadata(url) {
      const response = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error('更新描述过大');
      return text;
    }
    const feed = await resolveUpdateFeed(config, platform, arch, async url=>JSON.parse(await metadata(url)));
    const tag = new URL(feed.url).pathname.split('/').at(-2);
    const version = /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
    if (!version || !semver.lt(version,match[1])) return;
    const name = 'Qingtu-' + version + '-' + match[2];
    const {file,base} = await fromMirrors(preferredUrls(feed),async base => {
      let file;
      if (platform === 'darwin') {
        const envelope = JSON.parse(await metadata(new URL('mac-' + arch + '.json',base)));
        const manifest = decodeEnvelope(envelope,require('../desktop/sparkle-public-key.json').publicKey,arch,base);
        if (manifest.version === version && manifest.file.url === name) file = manifest.file;
      } else {
        const info = require('js-yaml').load(await metadata(new URL('latest.yml',base)));
        if (info.version === version) file = info.files.find(entry=>entry.url === name);
      }
      if (!file) throw new Error('发行清单缺少基线安装包');
      require('../desktop/chunk-download.cjs').validateParts(file,base);
      return {file,base};
    });
    const archive = await assembleParts({...file,qingtuDelta:undefined},base,path.resolve('.cache','delta-base',match[2]),{mirrorUrls:preferredUrls(feed,base).slice(1)});
    return {archive,version};
  } catch (error) {
    console.warn('未取得已发布基线，将生成完整更新。' + error.message);
  }
}

async function loadMap(archive, temp, label) {
  let data;
  try { data = await fs.readFile(archive + '.blockmap'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const map = path.join(temp, label + '.blockmap');
    await buildBlockMap(archive, 'gzip', map);
    data = await fs.readFile(map);
  }
  return JSON.parse(gunzipSync(data));
}

async function buildDelta(target, file, out, base) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'qingtu-delta-'));
  try {
    const oldMap = await loadMap(base.archive, temp, 'old');
    const newMap = await loadMap(target, temp, 'new');
    const ops = computeOperations(oldMap, newMap, {info(){}, warn:console.warn});
    const size = MAGIC.length + ops.reduce((sum, op) => sum + 8 + (op.kind === OperationKind.DOWNLOAD ? op.end - op.start : 0), 0);
    if (ops.length > MAX_OPERATIONS || size >= file.size || size > MAX_PATCH) return;
    const patch = Buffer.allocUnsafe(size);
    MAGIC.copy(patch);
    const input = await fs.open(target, 'r');
    try {
      let cursor = MAGIC.length;
      for (const {kind, start, end} of ops) {
        const literal = kind === OperationKind.DOWNLOAD, length = end - start;
        patch.writeUInt32LE(literal ? LITERAL : start, cursor);
        patch.writeUInt32LE(length, cursor + 4);
        cursor += 8;
        if (literal) {
          let copied = 0;
          while (copied < length) {
            const {bytesRead} = await input.read(patch, cursor + copied, length - copied, start + copied);
            if (!bytesRead) throw new Error('生成增量时安装包已变化');
            copied += bytesRead;
          }
          cursor += length;
        }
      }
    } finally { await input.close(); }
    // Exercise the same decoder that ships in the app before advertising a patch.
    await applyDelta(patch, base.archive, path.join(temp, 'restored'), file);
    const url = path.basename(target) + '.from-' + base.version + '.qtdelta';
    const baseSize = (await fs.stat(base.archive)).size, baseSha512 = await fileDigest(base.archive);
    await fs.writeFile(path.join(out, url), patch);
    return {url, size, sha512:createHash('sha512').update(patch).digest('base64'), baseSize, baseSha512};
  } finally { await fs.rm(temp, {recursive:true, force:true}); }
}
module.exports = {localBaseline, releaseBaseline, buildDelta};
