---
name: ins-editorial-layout
description: 把用户提供的照片排成 Ins 风封面、穿搭组图、细节页或多页轮播，导出可编辑 SVG 和 PNG。
---

# Ins 风照片排版

按照片数量、主体方向和画面用途选 [版式](references/layouts.md)。保持用户照片的比例和视觉色调。需要满框时用 `--fit cover`，逐张检查脸、手、鞋和服装关键细节是否被裁掉。

单页使用 `node scripts/render.cjs --list` 查看版式，再用 `--template`、`--photo` 和 `--out` 导出。每张照片传一次 `--photo`。多页先按用途划分封面、主造型、细节和收尾，共用一套配色，让相邻页的主次关系有变化。用 [轮播清单](references/carousel.md) 先出代表样张，再按同一规则导出整组。用户要求先看样张时，在样张交付处停下。

所有输出为 1200 × 1600。检查 PNG 的阅读顺序、缩略图文字和裁切。需要细调时编辑 SVG，用 `node scripts/svg_to_png.cjs edited.svg preview.png` 重新生成 PNG。SVG 内含缩放后的照片副本。

收到共用项目单时，使用 `scripts/project.cjs` 从通过验收的镜头生成轮播清单。按 [项目工作流](references/project-workflow.md) 执行页序变更、预检、人工复核和交付。正式页复用项目的字体、配色和留白；改稿时按实际页指纹重排受影响页。
