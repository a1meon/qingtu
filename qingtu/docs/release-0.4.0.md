# 轻图 0.4.0

已实现确认的蓝色界面：左侧纯图标与悬停/聚焦提示，中央蓝色折角图像角色和虚线拖入区，底部队列，右侧导出设置可收起。导入和导出共用蓝色立体按钮。空状态尺寸显示 3840 × 2160，格式默认 PNG，大小仍为 10 MB。导入后显示原图尺寸和 100% 缩放。

按钮按下 4 px、释放回弹，菜单弹入、图片入场、完成反馈与侧栏过渡；系统减少动态效果时停用。对比分割线保留逐帧直接更新。图像拼接是预留入口，未实现拼接算法。

验证：42 项引擎/服务测试；原生 Electron 流程烟测；默认值、提示、收起后状态保留、不重编码、实际 PNG 导出与减少动态效果测试；打包资源一致性；Apple Silicon 打包二进制引擎运行；Windows ZIP CRC 与 x64 EXE/Sharp 架构检查。浏览器通过文件选择器导入、切换预览并真实导出 PNG，控制台无错误或警告。视觉 QA 通过，见 design-qa.md。

分发包位于 release/：Apple Silicon 与 Intel Mac DMG/ZIP，Windows x64 完整应用 ZIP；校验为 SHA256SUMS-0.4.0.txt。Mac 未开发者签名/公证，Windows/Intel Mac 尚未实机运行。Windows ZIP 解压后运行轻图.exe并保留同目录资源。

中央插画由内置 Image Gen 制作，真实透明 PNG 为 public/assets/blue-file-empty.png。提示词依据确认稿提取折角纸框、两只眼睛、蓝山和太阳、两侧短线与淡蓝椭圆阴影，要求无文字、按钮、UI或背景。图标采用 Phosphor。
