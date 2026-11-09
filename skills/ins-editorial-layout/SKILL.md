---
name: ins-editorial-layout
description: 把已有照片排成小红书 / Instagram 杂志风封面和多页轮播。共 24 款版式，导出 3:4 与 4:5 的 PNG 和可编辑 SVG，附封面安全区、360 px 信息流预览、页序清单和配套文案。Lays out existing photos into magazine-style Instagram and Xiaohongshu covers and carousels (PNG + editable SVG). 不用于生成或修改照片本身、视频剪辑或印刷级 CMYK 排版。
license: MIT
metadata:
  version: "0.6.1"
---

# Ins 风照片排版

用已有照片制作杂志风封面和轮播，交付可编辑 SVG、PNG、预览、页序与文案。

## 红线（先读）

1. 真人肖像必须有授权，授权范围记在人物档案的 `consent`。没有授权时只用虚构人物素材。
2. 发布含 AI 生成内容时保留 AI 标识，并提醒用户在平台主动声明。
3. 文案只写画面可支持的细节，避开「显瘦」「所有身材都适合」「矫正体态」等体型、功效或医疗承诺。

## 开工前确认

- [ ] 照片数量、单页或轮播、平台与尺寸（`xhs34`、`ig34`、`ig45`）。
- [ ] 有无项目单、色板与字体。未指定时默认 1200 × 1600。
- [ ] 宿主能否安装 npm 包。不能安装时只走 SVG 路线，记录 PNG 和像素预检待补。

缺关键输入时只问影响下一步的事项，一次最多三个。

## 步骤

1. **拟定版式。** 按照片方向和用途分配封面、主造型、细节与收尾。产物是页序表，列出页号、用途、版式、照片和标题。确认每页安排符合平台尺寸。⏸ 交给用户确认页序表，再开始排版。
2. **排一页样张。** 用 `render.cjs` 排单页，或用 `render-carousel.cjs --preview` 取首页。用 `project.cjs preflight --preview --renders DIR` 核对项目单样张。产物是代表样张和检查结果。确认人物及服装关键部位入镜、标题可读。⏸ 交给用户确认样张，收到确认后再批量导出。
3. **逐页导出。** 有项目单时从已验收镜头生成 `manifest`，用页指纹定位改稿影响。产物是各尺寸图片、页序及安全区预览。确认裁切、配色、字体、留白和阅读顺序符合要求。
4. **复查交付。** 逐页看图并运行预检。产物是可编辑文件、清单与文案。确认审核对应当前稿号，图片和 SVG 一致，标识与文案风险已记录。

## 输出约定

| 文件 | 格式 | 必填 |
| --- | --- | --- |
| `manifest.json` | JSON | 版式、照片、页序、尺寸、配色、字体和标题 |
| `preview.svg` / `preview.png` | SVG / PNG | 代表页，PNG 取决于宿主依赖 |
| `page-NN.svg` / `page-NN.png` | SVG / PNG | 同版双格式，SVG 内嵌照片 |
| `<前缀>-safe.png` / `<前缀>-mobile.png` | PNG | 封面安全区和 360 px 预览，前缀来自 `cover-test --out` |
| `delivery.json` | JSON | 页序、验收和标识状态、文案风险记录 |
| `copy.md` | Markdown | 标题、正文、话题、逐页 alt text，适用时带 AI 内容声明 |

## 参考资料索引

- [版式清单](references/layouts.md) 用于按照片数和方向选版。
- [轮播说明](references/carousel.md) 用于准备清单、预览和单页重排。
- [多平台与封面检查](references/editions.md) 用于安全区、字体和不同尺寸导出。
- [项目工作流](references/project-workflow.md) 用于新建项目、逐页预检、文案和交付。
