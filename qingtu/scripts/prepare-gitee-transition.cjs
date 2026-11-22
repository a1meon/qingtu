// A one-time feed for installed Electron clients which only discover releases on Gitee.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, sign} = require('node:crypto');
const yaml = require('js-yaml');
const {releaseKey} = require('./release-key.cjs');
const {verifyFullRelease} = require('./verify-full-release.cjs');
const {decodeEnvelope} = require('../desktop/mac-updater.cjs');
const {releaseHosts} = require('../desktop/update-source.cjs');
const sources = require('../desktop/update-source.json');
const {publicKey} = require('../desktop/sparkle-public-key.json');

async function prepareTransition() {
  const version = '0.5.0';
  if (require('../package.json').version !== version) throw new Error('此脚本仅用于 Gitee 的一次性 0.5.0 迁移');
  await verifyFullRelease();
  const source = path.resolve('release', 'v' + version);
  const output = path.resolve('release', 'gitee-transition-v' + version);
  await fs.mkdir(output, {recursive: true});
  const base = releaseHosts(sources)[0].downloads + 'v' + version + '/';
  const windows = yaml.load(await fs.readFile(path.join(source, 'latest.yml'), 'utf8'));
  const {url, sha512, size} = windows.files[0];
  const exe = new URL(url, base).href;
  // The old Windows provider accepts an absolute HTTPS URL and verifies electron-builder's SHA-512.
  const legacyWindows = {version, files: [{url: exe, sha512, size}], path: exe, sha512, releaseDate: windows.releaseDate};
  await fs.writeFile(path.join(output, 'latest.yml'), yaml.dump(legacyWindows));
  const key = await releaseKey();
  const expected = new Set(['latest.yml']);
  for (const arch of ['arm64', 'x64']) {
    const name = 'mac-' + arch + '.json';
    const envelope = JSON.parse(await fs.readFile(path.join(source, name), 'utf8'));
    const {file} = decodeEnvelope(envelope, publicKey, arch, base);
    const zip = await fs.readFile(path.join(source, file.url));
    const parts = [];
    // The old Mac client allows relative names on Gitee only, with a two-minute deadline per piece.
    const partSize = 32 * 1024 * 1024;
    for (let offset = 0; offset < zip.length; offset += partSize) {
      const bytes = zip.subarray(offset, offset + partSize);
      const part = file.url + '.part' + String(parts.length + 1).padStart(2, '0');
      await fs.writeFile(path.join(output, part), bytes);
      parts.push({url: part, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64')});
      expected.add(part);
    }
    const legacyFile = {url: file.url, size: file.size, sha512: file.sha512, edSignature: file.edSignature, qingtuParts: parts};
    const payload = Buffer.from(JSON.stringify({version, arch, file: legacyFile}));
    const descriptor = {payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64')};
    await fs.writeFile(path.join(output, name), JSON.stringify(descriptor) + '\n');
    expected.add(name);
  }
  const staged = await fs.readdir(output);
  if (staged.length !== expected.size || staged.some(name => !expected.has(name))) {
    throw new Error('过渡目录含有意外文件');
  }
  console.log('Gitee 过渡附件已生成，共 ' + staged.length + ' 个文件。');
}

if (require.main === module) prepareTransition().catch(error => {console.error(error.message); process.exitCode = 1;});
