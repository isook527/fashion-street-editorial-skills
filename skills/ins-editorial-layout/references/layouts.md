# 版式与命令

| 照片数 | 版式 |
| --- | --- |
| 1 | `portrait-study` 居中竖幅、`wide-scene` 横幅、`right-column` 右侧主图、`square-mat` 方形衬纸、`vertical-band` 窄竖幅 |
| 2 | `side-by-side` 等宽并排、`offset-pair` 错层双图、`stacked-landscapes` 上下横图、`main-and-detail` 左主右细节、`square-and-strip` 主图配横条 |
| 3 | `three-steps` 三列错层、`one-over-two` 上一下面两图、`two-over-one` 上二下面一图、`look-and-notes` 左主图右叠图 |
| 4 | `four-tiles` 等格、`one-and-three` 上主图下三图、`three-and-one` 上三图下主图 |
| 5 | `four-around-one` 四角与中央、`five-in-two` 上二下三 |
| 6 | `six-frame-grid` 三列两行 |

`--title` 和 `--subtitle` 可省略，每项输入单行，最多分别为 18 和 34 字符。可选色板为 `paper`、`graphite`、`moss`、`blue`。接受静态 JPEG、PNG 和 WebP。照片按命令中的顺序放入相应框位。

```bash
node scripts/render.cjs --template main-and-detail --photo look.jpg --photo detail.png \
  --out ./lookbook --title '秋日穿搭' --subtitle '亚麻外套' --palette moss
```

使用浏览器或支持内嵌图像的 SVG 编辑器检查输出。系统需要安装可用的中文字形才能在 PNG 中正确渲染中文。已有同名文件时请换一个输出前缀。
