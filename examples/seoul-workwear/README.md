# The Seoul Edit

以首尔圣水洞为场景的早秋工装街拍。用 Codex 内置 ImageGen 生成虚构成年韩国男博主和无商标服装，保持烟草棕短夹克、白 T、炭灰宽腿裤和绿窗店面。以下是镜头提示词要点。

| 照片 | 提示词要点 |
| --- | --- |
| `walk.jpg` | 35 mm 街拍感，完整走姿，人物靠画面右侧，留出绿窗与水泥立柱 |
| `fit.jpg` | 同人物、服装和环境，正面全身，保留头顶、衣摆、腰线与双鞋 |
| `shoulder.jpg` | 同人物转身回看，肩缝和领口清晰，肩点和服装轮廓留在安全区 |
| `pockets.jpg` | 正面服装近景，双手离开衣身，完整呈现两个袋口和双线缝迹 |
| `pockets-blocked.jpg` | 从无遮挡近景生成对照，将前臂横过一个袋口，用于演示拒稿条件 |

仓库根目录安装排版依赖和字体后，运行：

```sh
node skills/ins-editorial-layout/scripts/render-carousel.cjs examples/seoul-workwear/carousel.json --out-dir seoul-carousel
```

配置包含中英杂志封面、照片压字和满版特写。默认导出 INS 3:4，可将同目录配置中的 `format` 改为 `ig45` 或 `xhs34`，使用新的输出目录复跑。

原始展示照片由 ImageGen 生成。轮播页由仓库脚本导出，GitHub README 的预览板使用这些导出页。贴袋对照仅验证袋口是否可见，商品验收实测仍见[短夹克项目](../short-jacket/project.json)。
