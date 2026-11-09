# 轮播排版与批量导出

先安排阅读顺序。封面用识别度最高的造型，正文让全身、半身和局部互相补充，末页收束。相邻页可从大幅图切换到双图或多格。统一色板、文字位置与间距，标题在缩略图仍需清楚。文字保持简短，只写与照片相关的信息。用户提供界面截图时，先选用无界面的照片原件；满框裁剪前核对服装和人物。

如有风格参考，记录版式节奏、留白和主次关系，选用本 Skill 的构图重新组织用户照片与文案。先导出最能体现整组设计的一页，核对裁切、色板、字体和缩略图可读性。

把计划保存为 `carousel.json`。照片路径相对于清单文件位置解析。

```json
{
  "palette": "paper",
  "pages": [
    {"template": "portrait-study", "photos": ["photos/look.jpg"], "title": "City layers"},
    {"template": "main-and-detail", "photos": ["photos/look.jpg", "photos/detail.jpg"], "subtitle": "Linen and charcoal"}
  ]
}
```

在本 Skill 目录完成 `npm ci` 后执行。输出目录可以是新目录。

```bash
node scripts/render-carousel.cjs /path/to/carousel.json --out-dir /path/to/exports --preview
node scripts/render-carousel.cjs /path/to/carousel.json --out-dir /path/to/exports
```

`--preview` 只导出首页为 `preview.svg` 与 `preview.png`。完整导出按清单顺序写入 `page-01`、`page-02` 等，每页都有 SVG 和 PNG。页内可选 `title`、`subtitle` 和 `fit`，长度与裁切规则与单页脚本一致。已有同名文件会报错。若中途因个别照片失败，修正后用 `--page N` 补跑缺失页，或另选输出目录重新导出整组。

按照片数量、主体方向和用途选版。按封面、主造型、细节和收尾分配轮播页，统一配色，让相邻页主次有变化。保持照片比例与视觉色调。满框用 `--fit cover`，逐张检查脸、手、鞋和商品细节。细调可编辑 SVG，再用 `node scripts/svg_to_png.cjs edited.svg preview.png` 生成 PNG。正常渲染嵌入缩放后的照片副本。

缺少 sharp 时，单页和轮播嵌入原文件，只导出 SVG。照片压字仍避开已标注的保护区，按固定候选顺序放置，需手动检查背景。预检、色差、对照、封面预览和正式交付需安装 sharp。
