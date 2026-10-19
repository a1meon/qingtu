# 轻图 0.5.3

修复轻量版窗口外壳：Windows 不再创建原生“文件”菜单，恢复系统标题栏、边缘缩放和系统窗口按钮；隐藏重复的页面窗口按钮。Mac 去掉额外的原生应用名标题栏，关闭、最小化、最大化按钮置于原有应用工具栏，保留原生菜单、快捷键和标题栏空白处拖动。

删除页面 650px 最小高度，工作区在实际客户区内分配剩余高度。两个模块的底部卡片不会因窗口变矮而被推到页面外。Windows 初始窗口根据所在显示器工作区与 DPI 计算物理尺寸和位置，不使用混合逻辑/物理坐标的运行环境居中接口。仅修改打包副本的 PE 清单，进程创建窗口前启用 PerMonitorV2，保留原 asInvoker 权限；原始下载的运行环境不变。

保持系统 WebView 轻量方案。Windows x64 安装包 9,278,261 字节；Mac arm64 DMG 11,042,671 字节，Mac x64 DMG 11,498,060 字节。Tauri 也使用系统 WebView，并不能单凭更换框架消除窗口配置问题；本次修复具体菜单、边框、视口与 DPI 原因，继续保持约 9–12 MB 的安装体积。

保留 Windows 0.4.3–0.4.8 的 latest.yml NSIS 更新路径，以及 Mac legacy → 0.4.9 → mac-light → 0.5.3 的签名通道。Mac 13.0–13.2 保留过渡版，轻量版要求 13.3+。Windows 要求 10/11 x64 和 WebView2。已安装但打不开的 Windows 0.5.0/0.5.1 用户可运行新 Setup.exe，沿用原目录覆盖安装，无需卸载或清理项目。

验证：315 项 Node 测试、278 项轻量后端测试、Go 测试及 Windows 交叉编译通过；13 项既有界面/恢复/质量检查通过。真实隐藏 Chromium 检查 Windows/Mac 两种外壳、两个模块、四组窗口尺寸与 DPR，共 16 种布局，无整页纵向溢出；Mac 按钮和拖动绑定检查通过。隐藏实际 Mac 经 0.4.8→0.4.9→0.5.3 两轮 Sparkle 替换重启，旧项目与原图字节不变，验证了新标题栏、原生拖动注册、导入、重载、PNG/JPEG 与同名导出。Windows 安装包提取载荷与构建文件逐字节一致，PE DPI 清单有效且非资源节与原入口地址不变；真实 NsisUpdater 本地下载校验通过。四份 Mac 更新归档均通过官方 Sparkle 验签。Windows 原生 WebView2、高 DPI 设备和 Intel Mac 原生运行未在本机执行。

发布时 Gitee 实际计费高于公开发行附件合计，并明确返回超过 1GB 配额。收到用户逐次执行确认后，已依次删除 v0.5.0（9 个附件 52,152,946 字节）和 v0.5.1（18 个附件 312,728,516 字节）；均在删除前完整匿名重下、备份并验证 SHA256 与原上传文件字节一致。备份保存在 release/archive-v050 和 release/archive-v051。保留 v0.5.2，完成 v0.5.3 全部 18 个附件，公开发行附件合计 625,473,983 字节。全部附件匿名下载与构建文件逐字节一致，四份 Mac 归档官方验签通过，Windows 真实 NsisUpdater 从 Gitee 下载并校验 SHA512，未触发安装。

Gitee 上传页的文件选择仅排队（autoProcessQueue=false），点击更新才发送实际上传。其 HTTP 200/error=1 的配额失败响应也可能触发表单跳转，必须核对公开附件清单与下载字节；不能只凭页面跳转认定上传成功。

源码实现提交 64b9c91 已推送。正式发行版：https://gitee.com/a1meon_admin/halframe-releases/releases/tag/v0.5.3 ，ID 1219177，prerelease=false，网页显示“最新版”，真实 API latest 已确认 v0.5.3。完整附件和签名已验证。发布后实时 API 检查在 Node、Electron net 和原生 Go 网络路径均遭遇 Gitee HTTP 403 Rate Limit Exceeded，冷却复查仍受限。使用先前真实 latest 的正式版响应快照，并实时获取公网签名清单，冻结旧 Mac 客户端正确识别 0.4.9 过渡与 0.5.3 轻量升级，13.0–13.2 保留过渡版；轻量客户端通过原生 HTTPS 下载、签名校验与当前版本不下载检查。Windows 真实 NsisUpdater 从直接公网发行地址确认当前 0.5.3 不重复下载。以上快照/直接地址检查不等同于实时 API 已恢复，限流期间可直接下载安装包。

详细证据见 legacy-update-validation 中 0.5.3 对应记录。参考：[Neutralino 窗口配置](https://neutralino.js.org/docs/configuration/neutralino.config.json/)、[Windows 进程 DPI 感知配置](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process)、[Tauri Windows 分发](https://v2.tauri.app/distribute/windows-installer/)。
