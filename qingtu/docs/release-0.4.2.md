# 轻图 0.4.2

新增桌面自动更新和品牌旁版本入口。启动检查保持安静；发现新版询问确认再下载，下载支持后台继续，完成后选择重启安装。断网启动不打扰，手动检查可重试。处理/导出期间阻止安装重启。

支持 Gitee Releases 和国内 HTTPS 更新源，打包脚本可生成平台对应元数据；Gitee 的两种 Mac 架构使用独立描述文件，避免互相覆盖。没有源配置时不访问占位地址。浏览器仅提供版本入口，不具备桌面安装能力。

66 项测试、桌面更新流程烟测、原有图像处理和 UI 回归通过。更新测试使用隔离原生适配器，不下载/替换真实应用。尚无真实 Gitee 仓库或更新服务器，真实远程升级尚未验证；Mac 自动安装需要正式签名，Windows NSIS 在 Windows CI 构建。当前本机分发 Mac DMG/ZIP 与 Windows 目录 ZIP，Windows ZIP 不提供原地自动安装。

更新接入说明为 auto-update.md。后续已接入用户提供的 a1meon_admin/halframe-releases，并生成 release/gitee-bootstrap/ 配置包。仓库公开但尚无发行版；Mac Developer ID 签名和 Windows NSIS 首次正式发布仍需完成，实际远程自动升级尚未上线。
