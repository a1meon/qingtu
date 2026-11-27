# 轻图源码

Mac / Windows 本地图片压缩、分辨率调整与拼接应用。

应用源码、开发与打包说明位于 [qingtu/](qingtu/README.md)。

```sh
cd qingtu
npm ci
npm run dev
```

本仓库保存源码、测试、图标与设计资源；签名私钥、缓存、用户导出图片及安装包不提交。

## 跨电脑提交与发布

从任一源码仓库克隆后，暂存改动，在 `qingtu/` 运行 `npm run git:commit -- -m "提交说明"`。如果已通过 IDE 或 `git commit` 提交，运行 `npm run git:sync`。命令会依次推送同一个提交到 Gitee 和 GitHub，并读回两个远端核对提交号。新电脑首次推送时需要两个仓库的写权限。

从 0.5.0 起，正式安装包由腾讯云 CNB 和 [GitHub Releases](https://github.com/a1meon/qingtu/releases) 分发。Gitee 提供发行说明和下载入口。操作步骤见[发布手册](qingtu/docs/auto-update.md)，仓库约定见 [AGENTS.md](AGENTS.md)。

Mac 更新签名私钥须由发布者独立保管；已有公钥时缺少对应私钥将停止打包，不会自动生成替代密钥。
