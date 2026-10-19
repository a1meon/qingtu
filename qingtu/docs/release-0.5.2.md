# 轻图 0.5.2

修复 Windows 0.5.0/0.5.1 首次加载时缺少 NL_PORT / NL_TOKEN，导致 `ws://127.0.0.1:undefined?connectToken=undefined` 无法构造的问题。

Neutralino 6.10.0 的 Windows webview `init` 调用 `AddScriptToExecuteOnDocumentCreated(js, nullptr)` 后立即导航，没有等待异步注册完成。Microsoft 文档明确要求等待完成处理器后再使用注入脚本。本次在轻量 HTML 的 CSP 之后、模块脚本之前，阻塞加载同源的官方 `/__neutralino_globals.js` 端点，并关闭 native injectGlobals，避免启动顺序依赖和一次性令牌提前消耗。继续使用 one-time、exportAuthInfo=false 和原 CSP；未添加 unsafe-inline 或 eval。

客户端先验证启动配置，再监听 ready、初始化连接，并为未完成的握手提供超时。刷新时沿用官方 SDK 同源 sessionStorage 令牌，不重复取令牌。真实 SDK 在 WebSocket 错误时清空 body，异常界面会独立重建 root，保留下载修复版的入口。

## 已升级用户恢复

故障程序无法进入自身的更新流程，因此需要在程序外运行修复安装包：

1. 下载 Qingtu-0.5.2-Windows-x64-Setup.exe（9,276,744 字节，约9.28MB）。
2. 关闭轻图；无法关闭时，Ctrl+Shift+Esc 打开任务管理器，结束“轻图”进程。
3. 运行安装包，沿用原目录覆盖安装，再打开轻图。无需卸载、清理项目或在故障程序内检查更新。

使用原安装目录、作用域、GUID 与已有文件替换/回滚机制；本次没有改变项目存储和安装器文件清理范围。

## 更新兼容与验证

保留原 Windows 0.4.3–0.4.8 latest.yml 更新路径及两个 Mac legacy → 0.4.9 → mac-light → 0.5.2 通道。沿用已经发布的、字节不变的 0.4.9 过渡归档与原签名身份。Mac13.0–13.2 继续保留可用过渡版，轻量版需要13.3+。

307项 Node 测试、270项轻量后端测试、Go文件替换回滚测试通过。隐藏 Chromium 运行真实 Neutralino SDK，复现用户原始错误；新路径通过延迟globals、一次性端点刷新与真实socket拒绝/错误界面恢复。隐藏实际Mac完成0.4.8→0.4.9→0.5.2两轮Sparkle替换重启，旧项目完整清单与原图字节不变，并实际导入、重载、PNG/JPEG编码及同名编号导出。四份Mac更新归档均通过官方Sparkle验签。Windows NSIS提取载荷与构建文件逐字节一致，确认实际resources.neu的启动脚本顺序与one-time配置。Windows原生WebView2和Intel Mac原生运行未在此Mac上执行。

发行附件18个，共312,729,720字节。清理前已用772,082,321字节，超过新包所需空间。经用户执行前确认，删除最早v0.4.8的15个附件407,200,859字节；删除前匿名重新下载到release/archive-v048，通过全部SHA256并与原upload-v048逐字节一致。保留v0.5.0、v0.5.1，上传后预计677,611,182字节，低于1GB。

根因参考：[微软异步注入接口说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2#addscripttoexecuteondocumentcreated)、[Neutralino 6.10.0 Windows实现](https://github.com/neutralinojs/neutralinojs/blob/v6.10.0/lib/webview/webview.h)、[官方globals端点](https://github.com/neutralinojs/neutralinojs/blob/v6.10.0/server/router.cpp)。

正式发行版：https://gitee.com/a1meon_admin/halframe-releases/releases/tag/v0.5.2 （ID1219083，prerelease=false，真实latest指向0.5.2）。18个附件匿名下载与本地逐字节一致，四份Mac归档验签通过。Windows真实NsisUpdater从Gitee完成安装包下载与SHA512校验；当前0.5.2检查不下载。冻结旧客户端、过渡客户端与轻量客户端均通过真实latest入口检查。0.5.0与0.5.1旧下载页已保留原说明并置顶0.5.2恢复指引。实现提交7571810已推送；最终证据见legacy-update-validation/published-0.5.2.json。
