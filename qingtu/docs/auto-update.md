# 自动更新

0.4.6 已于 2026-10-15 联合正式发布至 Gitee，Windows x64、Mac arm64/x64 的匿名下载、签名及哈希、latest API 和当前版本不下载检查已通过。用户批准 Mac 采用 Sparkle 和免费 ad-hoc 签名，无需付费 Apple Developer Program。Windows 保留 NSIS 与 electron-updater。

启动只检查一次；发现新版先询问，确认后下载。下载完成后等待「重启并更新」，不因为普通退出自动安装。离线启动安静；版本号用于手动检查和重试。图片处理和导出期间不能重启；安装启动后不接受新的处理或保存任务。浏览器预览提示在桌面版更新。

## 发行 0.5.0 及以后版本

1. 配置 `desktop/update-source.json` 中属于项目的公开 CNB 仓库和 GitHub 镜像。客户端优先读取 CNB 的 `qingtu-updates` 分支根目录下的 `stable.json`，取得正式版本标签。备用入口为 GitHub 的最新正式版 API。后续下载固定在同一版本。
2. 运行 `npm run pack:mac`、`npm run pack:mac:intel`、`npm run pack:win`。在同一目录使用同一把发行签名密钥。三个命令将完整附件放入 `release/vX.Y.Z/`。Mac DMG 可直接拖入「应用程序」，ZIP 供自动更新。Windows EXE 用于初装及更新。
3. 为同平台的旧发行包与新包计算块差异。构建前可为单个平台设置 `QINGTU_DELTA_BASE` 指向正式发布的旧 EXE 或 ZIP。优先使用匹配基线的 `.qtdelta`；实际还原验证通过、并且足够小的补丁才进入清单。首次通过 DMG 安装的 Mac 若没有旧 ZIP，第一次应用内更新会取完整 ZIP，以后可复用已验证的缓存。
4. 联合发布前运行 `npm run release:verify -- --seal`，生成并签署完整 SHA-256 表。再次运行 `npm run release:verify` 可检查现有发行目录。核对 Windows 更新清单、两个架构的 Mac 签名、正式安装包及补丁。每个平台的实际产物还须通过安装包及更新器测试。
5. 在公开 CNB 仓库为本次发行创建同名标签。登录官方 CNB CLI 后运行 `npm run release:cnb`，创建草稿、上传发行目录的全部文件并执行匿名下载校验。匿名下载核对完毕后，将发行目录内的 `stable.json` 提交到 CNB 的 `qingtu-updates` 分支根目录。分支只用于发布可用版本，允许用户在不登录 CNB 的情况下检查更新。
6. 将正式源码提交和同名标签通过 `npm run git:sync -- --tag vX.Y.Z` 双推。GitHub 的标签工作流会从 CNB 获取签名校验表和文件，校验后上传 GitHub 草稿并发布。需要恢复同一发行时，可从已审核的发布脚本提交推送分支 `codex/release-retry/vX.Y.Z` 重新同步既有标签和草稿。也可在具备仓库写权限的 GitHub CLI 环境运行 `npm run release:mirror -- vX.Y.Z`。执行 `npm run release:mirror -- vX.Y.Z --verify-only` 可匿名校验两端的公开附件。Gitee 保留发行说明、CNB 与 GitHub 下载链接。
7. Gitee 发行仓库的最新正式发行版永久停在 v0.5.0，供仍在运行的 Electron 0.4.x 直接升级。执行 `node scripts/prepare-gitee-transition.cjs` 生成一次性兼容附件，上传至 Gitee v0.5.0。Windows 旧更新器从 Gitee 读取指向 CNB 完整 EXE 的清单并校验 SHA-512。旧 Mac 更新器只接受 Gitee 同一发行版下的相对文件名，因此在 Gitee 提供两套签名兼容清单和归档分片；它们合并后与 CNB、GitHub 的 ZIP 逐字节一致。以后仅在 Gitee 发行仓库 README 和版本文档添加新版本说明及下载入口，保留这个旧客户端入口。此次迁移面向 Electron 0.4.x。

## Mac 协议与信任

通过 CNB 的稳定版本文件或 GitHub 的公开 latest API 取得正式 tag，再加载 mac-arm64.json 或 mac-x64.json。这些小文件包含 base64 payload 和 Ed25519 signature。payload 绑定版本、架构、ZIP 原名、完整大小/SHA-512、可选补丁及其基线哈希，以及原始 ZIP 的 Sparkle EdDSA 签名。应用使用内置公钥先验证清单真实性，拒绝篡改、其他架构、无效路径、预发行和降级。

确认后流式下载至临时文件，或从已校验旧包还原新包。完整 SHA-512 验证通过后才保存到缓存并进入就绪状态。

只有明确点击重启，才启动 Sparkle。原生 SPUUserDriver 在这个已授权会话中继续下载/验证/安装步骤，没有第二套确认窗口。Sparkle 重新验证 ZIP EdDSA、解压、校验应用并替换和重启。下载 ZIP 与 appcast 由仅绑定 127.0.0.1、随机令牌和路径的服务提供；NSAllowsLocalNetworking 允许此本机交接，不开放全局 ATS 例外。服务退出时关闭。

原生桥接来自 desktop/native/sparkle.mm，使用 Sparkle 的公开 API。框架为官方 2.9.6，构建时验证归档 SHA-256，放到 Contents/Frameworks；N-API 桥接放到 Resources。electron-builder 在暂存资产后由内向外 ad-hoc 签名，禁止在完成签名后改动 bundle。

## 签名密钥

公钥位于 desktop/sparkle-public-key.json，随应用分发。私有种子只在本机 .cache/sparkle-signing/update-seed.txt，目录 0700、文件 0600，不放进 app、公开仓库或日志。未来版本必须沿用此密钥。本机已另存受限持久备份：~/Library/Application Support/Qingtu Release Signing/sparkle-update-seed.txt，目录 0700、文件 0600；异机发布应安全迁移这把密钥。丢失私钥但公钥已存在时，构建明确失败，不能自动生成另一把钥匙。

CI 可通过 QINGTU_SPARKLE_SEED secret 导入种子；未配置时不应发布 Mac 构建。已有备用 Apple Developer ID CSR 与 RSA 私钥不参与 Sparkle 更新，不要混淆或上传。

## 已验证与范围

Apple Silicon 真实两个 ad-hoc 签名 app：0.4.3 检查和确认下载，等待明确重启；Sparkle 替换实际 bundle 并自动重新启动为 0.4.4，界面版本与磁盘版本均为 0.4.4，进程 PID 改变。错误 ZIP EdDSA 被真实 Sparkle 拒绝，旧 bundle 保持 0.4.3。测试使用隔离复制的 app，未替换用户 /Applications 的安装。

已生成 Intel x64 原生桥接和包，并通过 codesign --verify --deep --strict；没有 Intel 主机运行验证。Windows 安装包已通过真实 NsisUpdater 检查/完整下载/SHA-512 验证；当前为 Mac 主机，没有执行 Windows 原生安装。

npm test 包含真实 HTTP、签名篡改、架构、版本、取消/中断/重试、私钥恢复和更新状态测试。npm run smoke:desktop / smoke:update 验证图片工作流、实际 Electron IPC/界面、离线与确认流程。真实 SDK 下载与实际 Sparkle 替换不能用适配器测试代替。

依据：[Sparkle 官方文档](https://sparkle-project.org/documentation/)、[Electron Sparkle 的 ad-hoc 模式](https://github.com/biw/electron-sparkle#adhoc-distributions)、[Apple 首次打开要求](https://support.apple.com/zh-cn/102445)。

## 发行归档（2026-10-15）

0.4.6 上传时触及 Gitee 单仓库附件总量限制。用户明确授权删除旧版 v0.4.4 的发行版及 15 个附件，删除前已完整备份元数据和附件并对照线上 SHA-256 清单校验，备份保存在原 Mac 的 `release/archive-v044/`。保留 v0.4.3 与 v0.4.5。不要未经确认继续清理其他线上旧版。
