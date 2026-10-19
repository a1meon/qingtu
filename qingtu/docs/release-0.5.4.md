# 轻图 0.5.4 · 本地候选版

Windows 移除重复的原生标题栏，仅保留界面内的最小化、最大化/还原和关闭按钮。工具栏空白处可拖动和双击最大化；更新弹窗整个元素从拖动区域排除，后来出现的下载和安装按钮也保持可点击。

恢复无边框窗口的八个边缘/角落缩放入口。原生助手读取物理鼠标坐标并调整窗口，保留最小尺寸、对侧固定边及 Escape 取消。窗口轮廓使用真实 Win32 圆角区域，半径为 12 个逻辑像素，随 DPI 和尺寸变化更新；最大化后移除圆角并贴合显示器工作区。没有修改全局系统外观设置。使用区域裁剪而非 DWM 圆角提示，兼容 Windows 10/11；不依赖仅支持 Windows 11 的自动圆角策略。

修复审查发现的窗口枚举回调泄漏：复用一个 Go 原生回调，而不是每次缩放创建不可释放的回调。Windows 原生测试窗口使用独立消息循环线程，避免跨线程窗口调用与形状锁产生死锁。

已运行：315 项 Node 测试、278 项轻量后端测试、Go 测试、Windows 测试程序交叉编译、13 项既有界面/恢复/裁剪/关闭/导出质量检查。真实隐藏 Chromium 检查两个平台、两个模块、四组窗口尺寸/DPR 共 16 种布局，Windows 只有一组应用内按钮，八个缩放入口均路由到正确操作，最大化/还原时页面圆角和缩放入口状态正确。实际 React/Neutralino SDK 的鼠标更新按钮回归检查通过。

使用 pack:release 构建完整 18 个更新兼容附件，本地总计 312,761,235 字节。Windows 安装包 9,285,140 字节；提取的四个载荷与构建文件逐字节一致，内置窗口配置 borderless=true、resizable=true。全部附件哈希、三个轻量签名清单及四份 Mac Sparkle 归档签名验证通过。

本机是 Mac，尚未在 Windows 上执行原生窗口缩放、最大化/还原及圆角测试。已准备隐藏的 Windows 原生测试，可在 Windows 运行 go test ./... 验证样式和原生圆角区域，但这里仅完成交叉编译。此候选版尚未上传 Gitee，正式版仍为 0.5.3；没有改动远程附件、更新通道或清理发行版空间。用户已安装的 /Applications/轻图.app 和项目数据保留。

参考：[Win32 窗口区域](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn)、[Windows 圆角策略及限制](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-rounded-corners)。
