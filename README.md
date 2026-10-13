# 轻图源码

Mac / Windows 本地图片压缩与分辨率调整应用。当前版本 0.4.5。

应用源码、开发与打包说明位于 [qingtu/](qingtu/README.md)。

```sh
cd qingtu
npm ci
npm run dev
```

本仓库保存源码、测试、图标与设计资源；签名私钥、缓存、用户导出图片及安装包不提交。
安装包及自动更新文件仍发布到 [halframe-releases](https://gitee.com/a1meon_admin/halframe-releases/releases)。

Mac 更新签名私钥须由发布者独立保管；已有公钥时缺少对应私钥将停止打包，不会自动生成替代密钥。
