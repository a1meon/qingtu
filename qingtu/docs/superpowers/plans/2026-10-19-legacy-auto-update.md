# 0.4.x 自动升级轻量版 Implementation Plan

> **For agentic workers:** Execute inline task by task with tests and review; do not start extra implementation agents.

**Goal:** 已具有正式更新客户端的 0.4.x 可在程序内升级到 0.5.1，不要求手动下载 DMG。

**Architecture:** Windows 保留 electron-updater 的 latest.yml，使用识别旧安装注册表及安装目录的轻量 NSIS。Mac 的旧 mac-{arch}.json 指向兼容 macOS 13.0 的 0.4.9 过渡版；过渡版读取独立 mac-light-{arch}.json，在验证签名及 macOS >=13.3 后通过原 Sparkle 原位安装轻量 0.5.1。最新正式版必须一直保留两类通道。

**Tech Stack:** Electron/Sparkle 2.9.6、Ed25519、Neutralino/wasm-vips、NSIS、Node test runner。

**Spec:** 用户要求“需要适配0.4.x自动更新”；macOS 13.3+ 和 Windows 10/11 的轻量要求已获用户接受。

## Global Constraints

- 保留生产公钥和本地私钥，禁止输出私钥；测试使用独立临时密钥。
- 用户项目、原图、导出文件不删除；Windows 自定义目录及每用户/全用户作用域保留。
- macOS 13.0–13.2 不安装无法启动的轻量包；过渡版保留完整编辑能力。
- 0.4.0/0.4.1 没有更新客户端，0.4.2 缺正式源/签名基线，不能凭远程附件为其新增客户端。
- 验证全程隐藏、屏幕外，禁止影响用户运行中的程序。
- 发布前检查 1,000,000,000 字节容量，必要时只清理最早版本，清理前完整备份并校验。

### Task 1: 独立 Mac 过渡通道和系统要求

Files: desktop/mac-updater.cjs, desktop/update-controller.cjs, desktop/main.cjs, tests/mac-updater.test.cjs, tests/update-controller.test.cjs.

- [x] 添加真实 HTTP 测试：mac-light 通道、签名最小系统要求、13.2 拒绝且无包下载、13.3 接受、无效系统要求拒绝、appcast 携带最低系统版本。
- [x] 先运行 `node --test tests/mac-updater.test.cjs tests/update-controller.test.cjs` 记录失败。
- [x] 构造器增加 channel/systemVersion；先验证清单再比较系统，抛出 UPDATE_OS_UNSUPPORTED；控制器显示具体要求；main 只在新构建使用 mac-light 通道。
- [x] 重跑同一测试并审查旧默认通道兼容。

### Task 2: Windows 安装迁移

Files: desktop/lite/installer.nsi, desktop/lite/windows-migration.nsh, desktop/lite/install_test.go.

- [x] 审查固定旧应用 GUID 510f7683-73da-5142-8631-32518f41bf0b、NSIS 目录选择优先级、显式 /D 及每用户/全用户作用域；使用Go真实文件系统测试每一步替换失败、重试、崩溃残留和提交恢复。
- [x] 使用旧 Software/GUID InstallLocation 与旧卸载项作发现源；保留 /D；仅全用户安装需要提权。使用同一 GUID 替换卸载项，清理匹配目录的 QingtuLite 旧项。
- [x] 新文件先暂存，检查写入错误，待旧进程退出；失败恢复原可执行文件；成功后清理明确拥有的 Electron 文件，禁止递归删除整个安装目录/用户资源。
- [x] 编译 NSIS，提取安装器验证新文件；明确注明无 Windows 原生安装环境。

### Task 3: 版本和兼容附件打包

Files: scripts/pack-lite.mjs, scripts/pack-update-bridge.cjs, scripts/prepare-legacy-update.cjs, package.json, package-lock.json.

- [x] 更新轻量版版本 0.5.1；打包 Windows 和 Mac 两架构。
- [x] 构建 0.4.9 Electron Mac 两架构 ZIP（最低 macOS 13.0），排除轻量运行时依赖及测试资源；沿用 Sparkle 公钥并完整签名。
- [x] 生成 mac-{arch}.json/过渡版分片、mac-light-{arch}.json/轻量 ZIP、latest.yml/轻量 EXE；所有通道签名、架构、大小、哈希完整验证。
- [x] 用冻结的真实 0.4.8 客户端验证新附件；用隐藏隔离应用执行 Sparkle 两阶段原位迁移并检查项目原图/清单不变。

### Task 4: 验证、审查和发布

Files: docs/auto-update.md, docs/release-0.5.1.md, docs/lightweight-validation/published-0.5.1.json.

- [x] 执行适当单元/集成/必需回归，使用独立 reviewer 审查更新边界，修复重要问题。
- [x] 容量计算、必要备份清理；Gitee 先预览发行附件，匿名下载全部校验并运行旧协议检查，再正式发布。
- [x] 更新发布记录，提交并推送源代码，确认远程提交与正式 release 一致。

完成：v0.5.1 已正式发布（ID1218966），清理前备份并经用户再次确认删除v0.4.7；18个线上附件均逐字节一致，真实latest和旧版通道检查通过。Windows原生安装及Intel Mac原生运行无可用设备，未声称执行。
