function httpsUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('更新地址须为 HTTPS'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('更新地址须为无凭据的 HTTPS 地址');
  }
  return url;
}

function releaseHosts(config) {
  return [config, ...(config.mirrors || [])].map(({provider, owner, repo}) => {
    if (!['gitee', 'github'].includes(provider) ||
        ![owner, repo].every(value => typeof value === 'string' && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(value))) {
      throw new Error('发行仓库地址无效');
    }
    const project = owner + '/' + repo;
    return {
      api: (provider === 'gitee' ? 'https://gitee.com/api/v5' : 'https://api.github.com') + '/repos/' + project + '/releases/latest',
      downloads: 'https://' + provider + '.com/' + project + '/releases/download/'
    };
  });
}

// The successful host goes first for the remaining files of the same release.
async function fromMirrors(sources, read, signal) {
  let failure;
  for (const source of sources) {
    signal?.throwIfAborted();
    try { return await read(source); }
    catch (error) {
      signal?.throwIfAborted();
      if (['ENOSPC', 'EACCES', 'EROFS', 'EPERM', 'EMFILE'].includes(error.code)) throw error;
      failure ??= error;
    }
  }
  throw failure || new Error('更新源尚未配置');
}

function preferredUrls(feed, first = feed.url) {
  return [...new Set([first, feed.url, ...(feed.mirrorUrls || [])])];
}

async function resolveUpdateFeed(config, platform, arch, requestJson) {
  if (!config) return null;
  if (!['darwin','win32'].includes(platform) || !['arm64','x64'].includes(arch)) throw new Error('此平台暂不支持自动更新');
  if (config.provider === 'generic') {
    if (!config.url) return null;
    const url = httpsUrl(config.url);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return {provider:'generic', url:new URL((platform === 'darwin' ? 'mac' : 'win') + '-' + arch + '/', url).href, useMultipleRangeRequest:false};
  }
  if (config.provider !== 'gitee') throw new Error('更新源类型无效');
  if (!config.owner || !config.repo) return null;
  const hosts = releaseHosts(config);
  return fromMirrors(hosts, async host => {
    const release = await requestJson(host.api);
    if (release?.prerelease || release?.draft || !/^v\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(release?.tag_name)) throw new Error('没有可用的正式发行版');
    const path = release.tag_name + '/';
    return {
      provider:'generic', url:host.downloads + path,
      mirrorUrls:hosts.filter(other => other !== host).map(other => other.downloads + path),
      releaseVersion:release.tag_name.slice(1), channel:platform === 'darwin' ? 'latest-' + arch : 'latest', useMultipleRangeRequest:false
    };
  });
}
module.exports = {resolveUpdateFeed, httpsUrl, releaseHosts, fromMirrors, preferredUrls};
