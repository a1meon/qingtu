# 轻图 0.5.3

修复轻量版窗口外壳：Windows 不再创建原生“文件”菜单，恢复系统标题栏、边缘缩放和系统窗口按钮；隐藏重复的页面窗口按钮。Mac 去掉额外的原生应用名标题栏，关闭、最小化、最大化按钮置于原有应用工具栏，保留原生菜单、快捷键和标题栏空白处拖动。

删除页面 650px 最小高度，工作区在实际客户区内分配剩余高度。两个模块的底部卡片不会因窗口变矮而被推到页面外。Windows 初始窗口根据所在显示器工作区与 DPI 计算物理尺寸和位置，不使用混合逻辑/物理坐标的运行环境居中接口。仅修改打包副本的 PE 清单，进程创建窗口前启用 PerMonitorV2，保留原 asInvoker 权限；原始下载的运行环境不变。

保持系统 WebView 轻量方案。Windows x64 安装包 9,278,261 字节；Mac arm64 DMG 11,042,671 字节，Mac x64 DMG 11,498,060 字节。Tauri 也使用系统 WebView，并不能单凭更换框架消除窗口配置问题；本次修复具体菜单、边框、视口与 DPI 原因，继续保持约 9–12 MB 的安装体积。

保留 Windows 0.4.3–0.4.8 的 latest.yml NSIS 更新路径，以及 Mac legacy → 0.4.9 → mac-light → 0.5.3 的签名通道。Mac 13.0–13.2 保留过渡版，轻量版要求 13.3+。Windows 要求 10/11 x64 和 WebView2。已安装但打不开的 Windows 0.5.0/0.5.1 用户可运行新 Setup.exe，沿用原目录覆盖安装，无需卸载或清理项目。

验证：315 项 Node 测试、278 项轻量后端测试、Go 测试及 Windows 交叉编译通过；13 项既有界面/恢复/质量检查通过。真实隐藏 Chromium 检查 Windows/Mac 两种外壳、两个模块、四组窗口尺寸与 DPR，共 16 种布局，无整页纵向溢出；Mac 按钮和拖动绑定检查通过。隐藏实际 Mac 经 0.4.8→0.4.9→0.5.3 两轮 Sparkle 替换重启，旧项目与原图字节不变，验证了新标题栏、原生拖动注册、导入、重载、PNG/JPEG 与同名导出。Windows 安装包提取载荷与构建文件逐字节一致，PE DPI 清单有效且非资源节与原入口地址不变；真实 NsisUpdater 本地下载校验通过。四份 Mac 更新归档均通过官方 Sparkle 验签。Windows 原生 WebView2、高 DPI 设备和 Intel Mac 原生运行未在本机执行。

发布前核对远程版本和附件清单：现有 677,611,182 字节，新版本 18 个附件 312,744,263 字节，合计 990,355,445 字节，小于 1GB。实际上传时 Gitee 返回超过配额，公开发行附件合计未覆盖服务端计费的全部附件；最后一个 Intel 兼容更新分片未能上传。已重新完整备份并校验最早 v0.5.0（9 个附件 52,152,946 字节），收到用户执行时确认后已删除，保留 v0.5.1、v0.5.2。清理后的公开发行附件预计合计 938,202,499 字节；实际剩余容量仍以 Gitee 上传结果为准。详细证据见 legacy-update-validation 中 0.5.3 对应记录。

参考：[Neutralino 窗口配置](https://neutralino.js.org/docs/configuration/neutralino.config.json/)、[Windows 进程 DPI 感知配置](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process)、[Tauri Windows 分发](https://v2.tauri.app/distribute/windows-installer/)。

源码实现提交 64b9c91 已推送。预览发行版 v0.5.3（ID 1219177）已保存，保持 prerelease=true，正式 latest 仍为 0.5.2。17 个已上传附件匿名下载与本地逐字节一致；缺少 Qingtu-0.4.9-mac-x64.zip.part02。Windows 真实 NsisUpdater 已从 Gitee 预览版完成安装包下载及 SHA512 校验，未触发安装。待清理确认后补传缺失分片、重新核对全部 18 个附件及四份归档签名，再转为正式版。

后续容量诊断：删除 v0.5.0 后，Gitee 上传端点仍明确返回 HTTP 200 / error=1，消息为超过 1GB 附件配额；最后一个 Intel 过渡分片仍未附上。已通过浏览器只读查看官方上传页脚本：Dropzone autoProcessQueue=false，文件选择仅排队；点击更新才 processQueue。成功回调在检查 response.error 前先推动表单提交，因此失败响应也可能进入显示页，不能把页面跳转当成上传成功。后续必须核对上传响应和公开 18 文件清单。下一最早版本 v0.5.1 的 18 个附件已完整备份至 release/archive-v051，逐字节对照既有匿名下载和原上传文件，全部 SHA256 通过，等待此次永久删除的执行时确认。预览版和正式 latest 状态保持不变。
