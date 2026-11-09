# 杂志版式、多平台导出和封面检查

20 款基础版式继续可用。新增四种设计：

| ID | 排版规则 |
| --- | --- |
| full-bleed | 图像铺满画布 |
| photo-overlay | 优先找低纹理区域，自动选择候选压字位置，加深背景并报告保守对比度下限 |
| issue-number | 1～5 位大数字，配副题与主图 |
| bilingual-magazine | 中英两级文字，主标题 112 px、第二级 26 px，字号比约 4.3:1 |

文字压图可以在项目页中设置 `protected`。每块为基于 1200 × 1600 设计画布的归一化 `[x,y,width,height]`，标出人物、商品、原有标识等区域。系统会排除重叠的位置。找不到候选区域时报错，缩短文案或换版。未标注时只分析背景纹理与亮度，仍需看图确认主体位置。满版会裁图。给每个尺寸单独检查脸、商品细节和文字。

```sh
node scripts/project.cjs editions project.json --formats xhs34,ig34,ig45 --out exports
```

预设输出为小红书和 IG 的 1200 × 1600，及 IG 的 1200 × 1500。每套含 PNG、SVG、安全区样图、360 px 信息流预览。IG 另有中心 3:4 网格裁切模拟，供审阅时对照，最终以账户和客户端的实际上传预览为准。安全线只在预览图上。可用 `cover-test project.json --format ig45 --renders exports/ig45 --out cover --viewport 360` 重做封面预览。让看稿人在 3 秒内写出「是什么」「为什么点」，任一说不清就调整封面。命令只生成测试材料。

在排版 Skill 目录运行 `npm run fonts` 获取 Noto Sans CJK SC 和 Noto Serif CJK SC，或用 `npm run fonts -- --from /path/to/fonts` 从本地安装。未安装时用系统字体。跨软件编辑 SVG 时也可在系统安装这两款字体，以保持字形一致。字体分别采用 SIL OFL 1.1，见 [字体说明](../fonts/NOTICE.md)。
