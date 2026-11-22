// The official CNB CLI manages OAuth. Keep presigned upload and confirmation URLs out of logs.
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const path = require('node:path');
const {verifyFullRelease} = require('./verify-full-release.cjs');
const {releaseHosts} = require('../desktop/update-source.cjs');
const config = require('../desktop/update-source.json');
const {version} = require('../package.json');

const repo = config.owner + '/' + config.repo;
const tag = 'v' + version;

function cnb(command, args) {
  let result;
  try {
    const output = execFileSync('cnb', ['releases', command, '--repo', repo, ...args, '--verbose'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    result = JSON.parse(output);
  } catch (error) {
    throw new Error('CNB ' + command + ' 调用失败，退出码 ' + (error.status ?? error.code ?? '未知'));
  }
  if (result.status < 200 || result.status >= 300) throw new Error('CNB ' + command + ' HTTP ' + result.status);
  return result.data;
}

async function digest(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyRemote(base, file) {
  const response = await fetch(base + file.name, {signal: AbortSignal.timeout(1200000)});
  if (!response.ok) throw new Error('CNB 匿名下载失败 ' + file.name + ' HTTP ' + response.status);
  if (await digest(response.body) !== await digest(createReadStream(file.path))) {
    throw new Error('CNB 附件摘要不一致 ' + file.name);
  }
  console.log('Verified ' + file.name);
}

async function upload(releaseId, file) {
  const releaseArgs = ['--release-id', releaseId];
  const urls = cnb('post-release-asset-upload-url', [...releaseArgs, '--asset-name', file.name, '--size', String(file.size), '--ttl', '0']);
  const target = new URL(urls.upload_url);
  const confirm = new URL(urls.verify_url);
  const prefix = '/' + repo + '/-/releases/' + releaseId + '/asset-upload-confirmation/';
  const [token, assetPath] = confirm.pathname.startsWith(prefix)
    ? confirm.pathname.slice(prefix.length).split('/').map(decodeURIComponent) : [];
  if (target.protocol !== 'https:' || confirm.origin !== 'https://api.cnb.cool' || !token || !assetPath) {
    throw new Error('CNB 返回的上传确认地址无效');
  }
  const response = await fetch(target, {
    method: 'PUT', headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size)},
    body: createReadStream(file.path), duplex: 'half', redirect: 'error', signal: AbortSignal.timeout(1200000)
  });
  if (!response.ok) throw new Error('附件上传 HTTP ' + response.status);
  await response.arrayBuffer();
  cnb('post-release-asset-upload-confirmation', [...releaseArgs, '--upload-token', token, '--asset-path', assetPath, '--ttl', '0']);
}

async function uploadWithRetry(id, file, detail) {
  console.log('Uploading ' + file.name);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await upload(id, file);
      console.log('Uploaded ' + file.name);
      return;
    } catch (error) {
      const existing = detail().assets?.find(asset => asset.name === file.name);
      if (existing?.size === file.size) return;
      if (attempt === 3 || existing) throw new Error(file.name + ' 上传失败：' + error.message);
      console.warn(file.name + '，准备重试：' + error.message);
    }
  }
}

// Keep no more than three large transfers in flight. Finish started transfers before returning an error.
async function transfer(files, processFile) {
  for (let offset = 0; offset < files.length; offset += 3) {
    const results = await Promise.allSettled(files.slice(offset, offset + 3).map(processFile));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

async function publish() {
  await verifyFullRelease();
  const directory = path.resolve('release', tag);
  const files = await Promise.all((await fs.readdir(directory)).map(async name => {
    const pathname = path.join(directory, name);
    return {name, path: pathname, size: (await fs.stat(pathname)).size};
  }));
  files.sort((a, b) => a.size - b.size);
  const notes = path.resolve('docs', 'releases', tag + '.md');
  const releases = cnb('list-releases', ['--page', '1', '--page-size', '100']);
  const release = releases.find(item => item.tag_name === tag) ||
    cnb('post-release', ['--tag-name', tag, '--name', '轻图 ' + version, '--draft', '--body-file', notes]);
  const id = String(release.id);
  const detail = () => cnb('get-release-by-id', ['--release-id', id]);
  const assets = new Map((detail().assets || []).map(asset => [asset.name, asset]));
  for (const asset of assets.values()) {
    if (!files.some(file => file.name === asset.name && file.size === asset.size)) {
      throw new Error('CNB 已有不同的附件 ' + asset.name);
    }
  }
  const missing = files.filter(file => !assets.has(file.name));
  if (!release.draft && missing.length) throw new Error('已公开的 CNB 版本缺少附件');
  await transfer(missing, file => uploadWithRetry(id, file, detail));
  const current = detail();
  if (current.assets?.length !== files.length) throw new Error('CNB 附件数量不匹配');
  for (const file of files) {
    const stored = current.assets.find(asset => asset.name === file.name);
    if (stored?.hash_algo !== 'sha256' || stored.hash_value !== await digest(createReadStream(file.path))) {
      throw new Error('CNB 存储摘要与本地不一致 ' + file.name);
    }
  }
  if (current.draft) {
    cnb('patch-release', ['--release-id', id, '--data', JSON.stringify({draft: false, prerelease: false, make_latest: 'true'})]);
  }
  const published = cnb('get-release-by-tag', ['--tag', tag]);
  if (published.tag_name !== tag || published.draft || published.prerelease) throw new Error('CNB 正式版尚未公开');
  const base = releaseHosts(config)[0].downloads + tag + '/';
  // Activate the stable branch only after every public attachment passes a byte-for-byte check.
  await transfer(files, file => verifyRemote(base, file));
}

if (require.main === module) publish().catch(error => { console.error(error.message); process.exitCode = 1; });
