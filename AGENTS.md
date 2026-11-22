# 源码与正式发行同步规则

此规则适用于仓库内所有分支、所有开发电脑和从任一平台取得的新克隆。

- 每次用户要求提交或推送代码时，将同一分支、同一提交同步到 Gitee 的 `a1meon_admin/qingtu` 和 GitHub 的 `a1meon/qingtu`。暂存后在 `qingtu/` 运行 `npm run git:commit -- -m "提交说明"`。已有本地提交则运行 `npm run git:sync`。以命令读回的两个远端提交号为完成依据。出现分歧先查清原因。不得强推。
- 从 v0.4.9 之后的下一次正式发行起，同时向 Gitee 的 `a1meon_admin/halframe-releases` 和 GitHub Releases 的 `a1meon/qingtu` 分发同一版本的全部公开附件。覆盖 Windows x64、macOS Apple Silicon 和 Intel，包括初装入口、平台清单、分片、已生成的增量补丁和 SHA-256 校验表。两个源必须可独立下载。保持已发布附件不可变。
- 仅在正式发版时推送版本标签和发行附件。先按应用的发布手册验证构建及签名，将本地发行标签用 `npm run git:sync -- --tag vX.Y.Z` 推到两端，再按手册完成 Gitee 发布和 GitHub 镜像核验。仅一端成功时继续补齐同一版本。新增官方更新源时，同时更新客户端、发行流程和校验步骤。
- 各电脑使用具有对应仓库写权限的凭据。密钥、令牌及带凭据的远端 URL 均由本机或 CI 平台管理。
