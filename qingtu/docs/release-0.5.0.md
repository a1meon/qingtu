# 轻图 0.5.0：轻量桌面版

本版包含此前全部图像编辑/压缩交互修正，并把桌面壳由 Electron 改为 Neutralinojs 6.10.0 系统 WebView。wasm-vips 0.0.19 与原 Sharp 均使用 libvips 8.18.7；图像预算、合成、原图副本、项目备份和导出命名继续共用原有 engine。独立 Web Worker 处理图片，小型 Go 原生服务负责独占文件写入、同步、原子替换和更新下载。安装包不再携带 Electron 或 Node。

最低系统为用户已接受的 macOS 13.3、Windows 10/11 x64 + WebView2。Windows 安装器仅在缺少 WebView2 时调用微软原装引导程序联网安装共享运行时；不是下载另一份 Electron。Mac 使用系统原生标题栏。

项目路径保持 `~/Library/Application Support/qingtu/stitch-projects` 或 `%APPDATA%/qingtu/stitch-projects`，原图副本和项目清单格式不变。保留原子保存、上一代备份与同名导出自动编号。卸载仅删除程序拥有的文件，保留用户项目和安装目录内其他文件；更新恢复用户选择的安装路径。

更新清单沿用现有 Ed25519 身份，并绑定平台、架构、实际大小和 SHA-256。下载校验通过后才允许打开安装包。Windows 启动安装器，Mac 明确显示“打开安装包”，需拖入应用程序替换。0.4.x → 0.5.0 需要手动下载安装一次：旧客户端无法识别提高后的 Mac 系统最低要求，Windows 旧安装路径登记方式也不同，因此不向旧自动替换通道投放 0.5.0 包。先退出旧版，Mac 在应用程序中替换，Windows 先卸载原 Electron 版（保留用户项目），再安装轻量版；轻量版独立使用 Programs/QingtuLite 安装目录。0.5.0 之后继续使用新的签名更新清单。普通关闭不会安装更新。启动静默检查，失败一分钟退避，成功响应缓存十分钟，按语义版本排序，避免反复请求 Gitee 以及将发行顺序当版本顺序。

## 验证记录

- 原有 Node 测试 298 项、轻量后端测试 265 项全部通过，分别记录于 `artifacts/full-test-0.5.0-release.log`、`artifacts/lite-all-engine-test-release.log`。
- `artifacts/required-checks-0.5.0.json` 记录全部 13 项仓库必需构建/原生界面/画布/裁剪/拆分/恢复/优化/PNG质量/网站检查；全程隐藏并移出屏幕，未触碰用户运行中的旧版应用。
- 实际 WKWebView/Neutralino 打包副本验证界面挂载、Worker、PNG/JPEG、原图导入、项目保存/重载、同名导出编号和正常关闭。
- ICC Display-P3 色彩、透明 PNG 原始像素、裁剪、拉伸、精确旋转、拆分、固定画布边缘、预算缩放与导出字节上限均有实际编码回归；文件服务测试独占创建、持久化和错误下载不覆盖旧文件。
- 两种 Mac 架构构建及 ad-hoc 签名校验，Windows NSIS 构建/静态解包与内容验证。当前主机没有 Windows，也没有 Rosetta；Windows 原生安装/运行、Intel Mac 原生执行仍需对应设备验证。
- 固定版本工具下载及 SHA-256 记录在 `scripts/prepare-lite-tools.mjs`。构建使用 `npm run prepare:lite`、现有 NSIS 3.12 工具缓存、`npm run pack:lite`；源代码与工具链均不包含私钥，发布签名使用原有本地身份。

## 发布状态

本地构建及签名/哈希/内容检查完成。当前公开发行清单确认线上仅保留 v0.4.7、v0.4.8，各 15 个附件，合计 814,398,065 字节；本次 9 个附件合计 52,152,946 字节，上传后预计 866,551,011 字节，低于 1 GB，故不删除历史版本。该计算采用当前 API 附件名单和此前下载验证的逐文件大小。

| 安装包 | 字节 | MB（十进制） |
|---|---:|---:|
| Qingtu-0.5.0-Mac-arm64-Installer.dmg | 11,025,785 | 11.03 |
| Qingtu-0.5.0-Mac-x64-Installer.dmg | 11,483,147 | 11.48 |
| Qingtu-0.5.0-Windows-x64-Setup.exe | 9,248,731 | 9.25 |

源码已推送至 origin/codex/stitch-and-quality：实现提交 62a8aeb，验证记录提交 1c03dea。9 个发行附件白名单位于 release/upload-v050。Gitee 已正式发布：[v0.5.0](https://gitee.com/a1meon_admin/halframe-releases/releases/tag/v0.5.0)（发行版 ID 1218806），页面确认“最新版”，API prerelease=false。全部 9 个附件匿名重新下载后与本地逐字节一致，SHA-256 和三个签名更新清单校验通过。真实原生 HTTPS/文件服务仅请求一次版本列表，0.5.0 当前版本检查不自动下载；模拟旧基线后发现 0.5.0，下载并校验实际 Mac 安装包至 ready，未执行安装。Windows/Intel 安装包已匿名下载与哈希核对，未在对应原生系统执行。未删除任何历史版本。
