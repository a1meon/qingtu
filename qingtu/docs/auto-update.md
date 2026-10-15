# 自动更新（0.4.6）

0.4.6 已于 2026-10-15 联合正式发布至 Gitee，Windows x64、Mac arm64/x64 的匿名下载、签名及哈希、latest API 和当前版本不下载检查已通过。用户批准 Mac 采用 Sparkle 和免费 ad-hoc 签名，无需付费 Apple Developer Program。Windows 保留 NSIS 与 electron-updater。

启动只检查一次；发现新版先询问，确认后下载。下载完成后等待「重启并更新」，不因为普通退出自动安装。离线启动安静；版本号用于手动检查和重试。图片处理和导出期间不能重启；安装启动后不接受新的处理或保存任务。浏览器预览提示在桌面版更新。

## 首次安装

旧 Mac 版不含 Sparkle，需要安装当前版本基线一次。下载对应架构的 Qingtu-0.4.6-Mac-arm64-Installer.dmg 或 Qingtu-0.4.6-Mac-x64-Installer.dmg，打开后双击「安装轻图.command」。它自动下载 Gitee 分片、校验各片和完整 ZIP、解压，在 Finder 中显示轻图及 Applications 快捷方式；拖入 Applications，再打开应用。

首次下载仍受 macOS 安全检查约束，必要时按系统「隐私与安全性 → 仍要打开」流程操作。免费签名不提供 Apple 开发者身份认证、公证或对受管 Mac 的兼容保证。安装器不要求用户复制终端命令，不修改 Gatekeeper，不用 sudo 或 xattr。

Windows 新安装可运行 Install-Qingtu-0.4.6-Windows.cmd，自动下载和合并、核对 SHA-512，再打开 NSIS 向导。已接入更新源和分片协议的 0.4.3 Windows 可以在应用内升级。

发行仓库：[a1meon_admin/halframe-releases](https://gitee.com/a1meon_admin/halframe-releases)。各版使用与 package.json 一致的 vX.Y.Z 标签。当前配置为 desktop/update-source.json 的公开 Gitee 源，客户端不带令牌。

## Mac 协议与信任

通过公开 latest API 取得正式 tag，再加载 mac-arm64.json 或 mac-x64.json。这些小文件包含 base64 payload 和 Ed25519 signature。payload 绑定版本、架构、ZIP 原名、完整大小/SHA-512、各分片大小/SHA-512，以及原始 ZIP 的 Sparkle EdDSA 签名。应用使用内置公钥先验证清单真实性，拒绝篡改、其他架构、无效路径、预发行和降级。

确认后流式写盘和合并，复用已校验分片；完整包哈希验证后才能进入就绪状态。最多 64 MiB/片、1 GiB/包、32 片。合并峰值约两份包，不将整个下载装入内存。

只有明确点击重启，才启动 Sparkle。原生 SPUUserDriver 在这个已授权会话中继续下载/验证/安装步骤，没有第二套确认窗口。Sparkle 重新验证 ZIP EdDSA、解压、校验应用并替换和重启。下载 ZIP 与 appcast 由仅绑定 127.0.0.1、随机令牌和路径的服务提供；NSAllowsLocalNetworking 允许此本机交接，不开放全局 ATS 例外。服务退出时关闭。

原生桥接来自 desktop/native/sparkle.mm，使用 Sparkle 的公开 API。框架为官方 2.9.6，构建时验证归档 SHA-256，放到 Contents/Frameworks；N-API 桥接放到 Resources。electron-builder 在暂存资产后由内向外 ad-hoc 签名，禁止在完成签名后改动 bundle。

## 签名密钥

公钥位于 desktop/sparkle-public-key.json，随应用分发。私有种子只在本机 .cache/sparkle-signing/update-seed.txt，目录 0700、文件 0600，不放进 app、公开仓库或日志。未来版本必须沿用此密钥。本机已另存受限持久备份：~/Library/Application Support/Qingtu Release Signing/sparkle-update-seed.txt，目录 0700、文件 0600；异机发布应安全迁移这把密钥。丢失私钥但公钥已存在时，构建明确失败，不能自动生成另一把钥匙。

CI 可通过 QINGTU_SPARKLE_SEED secret 导入种子；未配置时不应发布 Mac 构建。已有备用 Apple Developer ID CSR 与 RSA 私钥不参与 Sparkle 更新，不要混淆或上传。

## 打包与发布

npm run pack:mac / pack:mac:intel 编译各架构桥接、生成构建配置、签名打包、生成签名清单/分片和小型首次安装 DMG。npm run pack:win 生成 NSIS 和分片。发布附件集中在 release/gitee-publish；自定义输出目录用对应 scripts/prepare-*.cjs 参数。

Mac 只上传更新 ZIP 的分片与签名清单、初装 DMG。Windows 上传 EXE 分片、latest.yml、初装 CMD。上传合并的 SHA256SUMS 校验表。标准大 DMG/ZIP 留作本地分发，不需要上传大文件或手工拼接。Gitee 单仓库附件总量 1G，未来发布需控制保留数量；清理线上旧版应另行确认。当前每个附件最多 64 MiB，均低于 Gitee 100M 上限。

先创建预览发行版并上传全部附件；验证匿名下载、清单签名、所有分片及完整包、Sparkle ZIP 签名和 Windows SDK 下载，再改为正式。每版附件保持不可变。联合发行必须带 Windows latest.yml，否则 latest API 指向 Mac 单平台版会影响 Windows 更新。

## 已验证与范围

Apple Silicon 真实两个 ad-hoc 签名 app：0.4.3 检查和确认下载，等待明确重启；Sparkle 替换实际 bundle 并自动重新启动为 0.4.4，界面版本与磁盘版本均为 0.4.4，进程 PID 改变。错误 ZIP EdDSA 被真实 Sparkle 拒绝，旧 bundle 保持 0.4.3。测试使用隔离复制的 app，未替换用户 /Applications 的安装。

已生成 Intel x64 原生桥接和包，并通过 codesign --verify --deep --strict；没有 Intel 主机运行验证。Windows 安装包已通过真实 NsisUpdater 检查/完整下载/SHA-512 验证；当前为 Mac 主机，没有执行 Windows 原生安装。

npm test 包含真实 HTTP、签名篡改、架构、版本、取消/中断/重试、私钥恢复和更新状态测试。npm run smoke:desktop / smoke:update 验证图片工作流、实际 Electron IPC/界面、离线与确认流程。真实 SDK 下载与实际 Sparkle 替换不能用适配器测试代替。

依据：[Sparkle 官方文档](https://sparkle-project.org/documentation/)、[Electron Sparkle 的 ad-hoc 模式](https://github.com/biw/electron-sparkle#adhoc-distributions)、[Apple 首次打开要求](https://support.apple.com/zh-cn/102445)。

## 发行归档（2026-10-15）

0.4.6 上传时触及 Gitee 单仓库附件总量限制。用户明确授权删除旧版 v0.4.4 的发行版及 15 个附件，删除前已完整备份元数据和附件并对照线上 SHA-256 清单校验，备份保存在原 Mac 的 `release/archive-v044/`。保留 v0.4.3 与 v0.4.5。不要未经确认继续清理其他线上旧版。
