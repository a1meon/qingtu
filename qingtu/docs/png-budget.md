# PNG 体积优先与等比尺寸回退（2026-10-14）

用户确认的新规则：优先保留细节；当前尺寸的全彩高保真 PNG 超过上限时，允许等比降低分辨率，明确显示实际尺寸。这替代此前的“保持尺寸并提示增加上限”。原图、裁剪、顺序和设置的分辨率不被回写为缩小后的值。

`engine/png-quality.mjs` 仍负责固定尺寸的无损/受限误差编码。`engine/png-budget.mjs` 在收到有类型的体积不足结果后，从原始光栅用 Lanczos3 生成尺寸候选，验证真实 PNG 字节数后返回；取消、解码、文件或存储错误不会被当作体积不足吞掉。原尺寸先用压缩级别 9；缩放候选使用更快的级别 6、有限的颜色强度细化和最多五次成功尺寸邻域探测。若尚未找到可保存的结果，继续向下搜索至有效最小尺寸。

两种压缩级别均为无损 DEFLATE，改变耗时和字节数，不直接改变像素。调色板参数会启用 indexed PNG，而非提高全彩无损质量。核对了本机 Sharp 0.35.5 / libvips 8.18.7 / libpng 1.6.58 / zlib-ng 2.3.3 / imagequant 2.4.1，并对照 [Sharp 输出参数](https://sharp.pixelplumbing.com/api-output/)与 [PNG 的 DEFLATE 规范](https://www.libpng.org/pub/png/spec/1.2/PNG-Compression.html)。没有新增编码器依赖。

PNG 始终保持完整颜色空间与透明背景。缩放改变空间采样，但不会自动裁切、增加外边距或填充无意义字节。严格 2.5:1 画布的两边保持 5:2 整数尺寸；其他拼接结果仍满足每边最多 5999 px、比例不超过 2.5。原文件已符合预算且无需改尺寸/格式时继续直接复用，较小的无损文件不会被撑大。

压缩和拼接的预览状态显示实际尺寸与“等比调整”。拼接在自动缩小后展示真正解码的导出预览；拖拽时临时使用低分辨率图片层，结束后恢复真实结果，不在鼠标移动时编码。批量结果包含被调整的实际尺寸。预览与保存共用处理引擎，最终再用文件实际字节数校验。界面最小值为 1 KB；旧 API 允许的 64 字节小于有效全彩 PNG 的头部和像素体积，这类非法极小预算仍会明确报错。

## 实际验证

完整客观数据、SHA256、原尺寸观察误差与检查结果见 [report.json](png-budget-validation/report.json)。未压缩的照片、纹理、渐变、文字和透明样片来自仓库及可复现测试图；最后一项是真实的用户附件，不再以测试图代替该附件验证。

| 样片 | 设置上限（字节） | 实际字节 | 导出尺寸 | 相对设置尺寸 |
| --- | ---: | ---: | --- | --- |
| 照片 | 1,799,205 | 1,783,205 | 1404×936 | 1536×1024 等比缩小 |
| 纹理 | 1,917,959 | 1,907,163 | 1491×839 | 1600×900 等比缩小 |
| 渐变 | 4,982 | 4,914 | 1153×649 | 1600×900 等比缩小 |
| 文字 | 30,677 | 30,318 | 944×531 | 1600×900 等比缩小 |
| 透明 | 155,786 | 146,936 | 859×483 | 1600×900 等比缩小 |
| 用户附件 | 10,000,000 | 9,882,791 | 3679×2053 | 5504×3072 等比缩小 |

实际用户附件原始体积 27,254,812 字节；真正无损的全尺寸测试结果约 19.83 MB，达不到 10 MB。最终 PNG 实际占预算约 98.83%，浏览器点击导出的文件与引擎验证文件 SHA256 相同：`3a5a3fb82a2509a6de8ae3dee044321c6b1dc5096d4e6eb5d87ab04d1af9a5b7`。实际输出保留在本地 `artifacts/browser-exports/_文档加工_Web扫描_标注1790758422-qingtu-2.png`，原图及附件派生文件未加入 Git。

与同尺寸 Lanczos3 基准相比，该附件的 PNG 编码 RGB 最大误差 2/255、RMSE 1.1767、PSNR 46.72 dB，Alpha 误差 0。恢复到原图观察尺寸后，包含缩放损失的 RGB RMSE 为 4.0092、PSNR 36.07 dB；因此不能称为原尺寸无损。

视觉检查使用 100% 原像素裁片，右列把导出恢复到原尺寸以观察细节损失：[照片](png-budget-validation/photo-100pct.png)、[纹理](png-budget-validation/texture-100pct.png)、[渐变](png-budget-validation/gradient-100pct.png)、[文字](png-budget-validation/text-100pct.png)、[透明](png-budget-validation/transparent-100pct.png)。照片细枝和纹理略变软；文字边缘与透明样片文字在严格预算下可见软化。渐变未见明显阶梯。用户附件的字形、红色标框和色调保留，但细噪声与边缘略软。所有候选的编码误差都按实际导出尺寸验证，不能用较小的编码误差掩盖分辨率损失。透明图未加权 RGB 指标包含不可见颜色，报告另外列出白底合成后的可见误差。

本机附件处理：初版尺寸搜索 81.9 秒，改用快速缩放候选后 34.7 秒。时间不包含样片及参照图生成；首次大图仍需要数十秒，不承诺任意大图即时完成。照片由 5.0 秒降到 4.0 秒，纹理由 10.3 秒降到 3.4 秒；候选编码保持相同的误差下限。

156/156 测试、构建、`smoke:desktop`、`smoke:ui`、`smoke:recovery`、`smoke:optimization`、`smoke:png-budget`、`verify:quality`、`verify:png-budget` 通过。新增检查覆盖 1 KB/10 KB/25 KB、真实保存与预览一致、格式和 Alpha、严格比例、原图/设置恢复、取消、缓存、批量项目，以及真实桌面拖拽期间临时图层和导出预览的切换。桌面 1 KB 检查输出为 25×10：压缩 719 字节、拼接 720 字节；均未越过上限。桌面截图见 [压缩](png-budget-validation/compression-ui.png)和 [拼接](png-budget-validation/stitch-ui.png)。

Windows 原生开发运行与浏览器已验证；Mac 原生、打包安装未验证。没有合并 main、发布安装包或改变更新签名密钥。

复现：

```sh
npm test
npm run build
npm run smoke:desktop
npm run smoke:ui
npm run smoke:recovery
npm run smoke:optimization
npm run smoke:png-budget
npm run verify:quality
npm run verify:png-budget -- /path/to/original.png
```
