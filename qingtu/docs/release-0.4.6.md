# 轻图 0.4.6 · Mac / Windows

状态（2026-10-15）：Windows x64、Mac Apple Silicon、Mac Intel 已联合正式发布。15 个附件全部入库，匿名下载、完整性、签名和当前版本无需下载检查通过。

正式发行：[轻图 v0.4.6](https://gitee.com/a1meon_admin/halframe-releases/releases/tag/v0.4.6)。

发布源码：`codex/stitch-and-quality`，`190f8a1851aa28d22bf3b5988e99efc28f23bed2`。

## 更新内容

- 图像拼接工作台：横排、宫格、竖排、自由布局，多画布自动保存与批量导出。
- 拖动换序、八个缩放手柄、吸附、四边与四角裁剪、画布分割；越界图片可用“显示全部”找回。
- 优化裁剪支持第三张顶部比例及左右像素；调整图片后可再次优化，重置恢复导入尺寸和顺序。
- 全彩高保真 PNG、严格十进制体积上限；紧预算时等比调整分辨率并显示实际尺寸。

## 构建及校验

2026-10-15 在原 Mac 从上述提交重新构建 Windows x64、Mac Apple Silicon 和 Mac Intel。沿用原有 Ed25519 更新密钥、Mac ad-hoc 应用签名和 Gitee 分片更新，不需要付费 Developer ID。

250 项自动测试、构建、原生图片/UI/画布/裁剪/分割/恢复/优化检查、PNG 画质和体积验证通过。Apple Silicon 打包源码的原生图片导出与完整 UI 检查通过；实际打包的 Mac 可执行文件成功加载包内 Sharp 与 Sparkle 原生桥接，PNG 导出 1001×667、986,833 字节 ≤ 1,000,000 字节，符合预算的 JPG 原件逐字节保留；Windows 真实 NsisUpdater 的本地分片下载与整包 SHA-512 校验通过。两个 Mac 应用通过 `codesign --verify --deep --strict`，ZIP 通过官方 Sparkle 签名验证。两个初装 DMG 挂载核验，内部安装脚本可执行且与生成内容一致。三平台包内关键源码和更新公钥与发布源码逐字节一致，未包含私钥、用户项目或测试脚本。

| 原始安装或更新包 | 字节 | Gitee 分片数 |
| --- | ---: | ---: |
| Qingtu-0.4.6-win-x64.exe | 123,023,663 | 2 |
| Qingtu-0.4.6-mac-arm64.zip | 138,182,940 | 3 |
| Qingtu-0.4.6-mac-x64.zip | 145,936,380 | 3 |

正式附件共 15 个，每个分片最多 64 MiB：8 个包分片、Windows 初装 CMD、两个 Mac 初装 DMG、Windows 更新元数据、两个 Mac 签名清单及合并 SHA-256 校验表。大 DMG/ZIP/EXE 保留本地，不上传超限附件。

Intel Mac 原生运行、当前 Mac 构建的 Windows 安装器原生安装未在这台 Mac 执行。Windows 工作区此前对相同源码 0.4.6 的原生检查保存在 [report.json](release-0.4.6-validation/report.json)。保留用户正在运行的旧版应用和图片队列。

## 旧版归档

用户于 2026-10-15 明确授权清理 v0.4.4 发行版及其 15 个附件以释放 Gitee 附件空间。删除前已将发行元数据及所有附件备份到本机 `release/archive-v044/`，逐项对照线上 SHA-256 清单验证，共 406,398,311 字节。保留 v0.4.3 与 v0.4.5。

## 远程验证

两个 Mac ZIP 均使用真实 MacUpdater 匿名下载，验证签名清单、各分片及完整 SHA-512，再由官方 Sparkle `sign_update --verify` 验证原始 ZIP。真实 Windows NsisUpdater 匿名下载并验证完整 123,023,663 字节 NSIS 安装包，未触发安装。7 个小附件与本地已验证产物逐字节一致。正式 latest API 返回 v0.4.6、prerelease=false，三平台当前版本检查均不下载。完整记录：[mac-release.json](release-0.4.6-validation/mac-release.json)。
