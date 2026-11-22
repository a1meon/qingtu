const {GenericProvider} = require('electron-updater/out/providers/GenericProvider');
const {verifyWindowsManifest} = require('./windows-manifest.cjs');
const {validateArchive} = require('./chunk-download.cjs');
const {fromMirrors, preferredUrls} = require('./update-source.cjs');

class GiteeChunkProvider extends GenericProvider {
  constructor(options, updater, runtimeOptions) {
    super(options, updater, {...runtimeOptions, isUseMultipleRangeRequest:false});
    this.transport = options.transport;
    this.feed = options;
  }

  async getLatestVersion() {
    return fromMirrors(preferredUrls(this.feed), async url => {
      const provider = new GenericProvider({...this.feed, url}, this.updater, this.runtimeOptions);
      provider.setRequestHeaders(this.requestHeaders);
      const info = await provider.getLatestVersion();
      if (this.feed.releaseVersion && this.feed.releaseVersion !== info.version) throw new Error('更新清单版本不匹配');
      if (!Array.isArray(info.files) || !info.files.length || info.files.length > 16) throw new Error('更新文件列表无效');
      if (this.feed.signedWindows) verifyWindowsManifest(info);
      for (const file of info.files) validateArchive(file, url);
      this.updater.disableDifferentialDownload = true;
      this.selected = provider;
      this.sources = preferredUrls(this.feed, url);
      return info;
    });
  }

  resolveFiles(info) {
    const files = this.selected.resolveFiles(info);
    this.transport.reset();
    return files.map(file => {
      this.updater.disableDifferentialDownload = true;
      const progress = (transferred, total = file.info.size, mode) =>
        this.updater.emit('download-progress', {total, transferred, percent:100 * transferred / total, bytesPerSecond:0, mode});
      return {...file, url:this.transport.register(file.info, this.sources[0], progress, this.sources.slice(1))};
    });
  }
}
module.exports = {GiteeChunkProvider};
