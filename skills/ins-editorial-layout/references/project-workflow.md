# 接单、出图与交付

一份 `project.json` 贯穿接单、试图、选片和排版。文件路径以项目单所在目录为基准。人物、品牌和商品各维护一份档案；真实素材和生成结果放在用户自己的项目里。仓库中的短夹克样例（`examples/short-jacket/project.json`）使用虚构人物和自制商品参考。独立安装时可用 `init` 建立自己的项目单。

## 确定客户要展示什么

商品保真用 `mode: "product"`。把可见的颜色、廓形、面料、纽扣、口袋、印花和参考来源记在商品档案；需要核对的卖点声明 `requires`。比如背部刺绣需要 `back` 图。没有照片时，相关镜头会显示缺项，已有证据覆盖的镜头仍可安排。商品保真保护商品特征和身份；创意街拍用 `mode: "creative"`，通过 `request.allowChanges` 记录可变项，例如 scene、lighting、styling。

人物档案可记录正面、侧面、全身和 `driftWatch`。品牌档案记录拍摄方向、色板、字体、横向留白（`margin` 60–120）和封面构图。换同款新色时更新商品档案和参考，品牌档案可以继续使用。色板选 paper、graphite、moss、blue，字体选 sans、serif、mono，实际字形由系统字体提供。第一页省略 template 时使用品牌档案的 cover。

## 卖点 → 镜头 → 验收

| 卖点 | 镜头 | 验收 | 失败时 |
| --- | --- | --- | --- |
| 落肩 | S01，正侧半身，手臂放松 | 肩点、肩缝都可见，接缝低于自然肩点 | 只补 S01，改机位或手臂位置 |
| 短衣长 | S02，正面全身 | 腰线与直下摆关系符合约定，衣摆与鞋完整 | 只补 S02，退机位并移开遮挡 |
| 两个方形贴袋 | S03，正面中近景 | 两个袋口、边线及位置可核对 | 只补 S03，手臂离开衣身，保留人物与原商品参考 |

商品卖点 kind 支持 shoulder、hem、pocket、stripe、reflection、drape、back；也可以给自定义卖点写 framing、action、acceptance。把卖点 ID 放进镜头的 points。还没安排镜头时，`plan` 的 suggestedShots 会给出未覆盖卖点的景别、动作、验收与缺图。

## 试图、预算和修改

在排版 Skill 目录运行 `npm ci`，然后执行：

```sh
node scripts/project.cjs plan ../../examples/short-jacket/project.json
```

在 tools 中如实填 generate、multiReference、localEdit、video。能力不足时读取 plan 的诊断，按条件退回提示词、分镜或单镜头重做。预算设 maxAttempts、pilotSize；有已知单价时可另设 unitCost 和 costCap，二者单位保持一致。脚本给出下一批镜头和本项目记录的估计成本，不发起生成、不扣费。先看样张，再填 `pilot.shot` 和 `pilot.confirmed` 继续。数张试图时逐镜追加记录。每次生成或明确失败记为一个 attempt；中断时保留已记录结果，只运行 budget.next 中待做的镜头。

每个 attempt 记录 id、file、note 和 checks。人工复核 identity、garment、action、crop 及本镜头卖点，每项填 pass、fail 或 unknown。只有全部通过且文件存在的指定稿能进入轮播。jobs 会列失败项、缺失视角和受影响页。返工新增 attempt，保留上一稿，再更新 selected。

```sh
node scripts/project.cjs compare ../../examples/short-jacket/project.json --shot S03 --out comparison.png
```

对照图包含参考、上一稿与新稿。对比排版页时可以用 `--reference`、`--before`、`--after` 指定三份图片路径，并用 `--label "Page 2"` 标记页号。

## 从入选镜头导出轮播

```sh
node scripts/project.cjs manifest ../../examples/short-jacket/project.json > manifest.json
node scripts/project.cjs preflight ../../examples/short-jacket/project.json
node scripts/render-carousel.cjs manifest.json --out-dir renders --preview
node scripts/render-carousel.cjs manifest.json --out-dir renders
node scripts/project.cjs preflight ../../examples/short-jacket/project.json --renders renders
```

预检检查标题字数及字体度量、满框裁切比例、重复图、缺页、输出尺寸和 SVG / PNG 一致性。逐页查看图片和文字，特别是脸、手、鞋与衣服关键部位；审阅通过后记录该页的 `visual: {"status":"pass","stamp":"当前页的 stamp"}`。stamp 关联镜头稿号、素材哈希、文字、构图和品牌样式。任何一项修改后需要复核受影响页。

把旧 manifest 保存下来。更新项目后，用 `changes … --previous old-manifest.json` 得到受影响页号，向新目录用 `--page N` 补渲染这些页，并复制其他未变页的文件。脚本会核对每页的稿号，避免混用。全部确认后导出可交付文件：

```sh
node scripts/project.cjs deliver ../../examples/short-jacket/project.json --renders renders --out delivery
```

交付目录含逐页 PNG、可编辑 SVG、缩略总览及 `delivery.json` 页序清单。

## 进阶项目单与实测

`concept` 可存 line、references（最多 3 个图路径）、moods（最多 3 词）、facts（light、temperature、street、time）、grade 和 whiteBalance。先看 `plan` 的 creative.missing。分镜可存 rhythmRole 和 camera，默认 9 张 3:4，动作库按商品档案 volume 选择。把卖点绑定到节奏里的具体镜头。

`quality.enabled: true` 增加逐图审查。artifacts 要逐项记 hands、buttons、pockets、shoes、intersections、perspective、textLogo。值为 pass、fail，或附 artifactNotes 的 na。商品档案 counts 保存可数的规格，attempt.counts 保存观察值。每稿的 prompt 至少记录 version、text、tool 和 seed，未知 seed 用 null。可另外记录 model。启用概念调色时，每稿 grade 记录 preset、whiteBalance 和人工 skin 判定，必须与样张约定一致。

初次失败可记 failureCause，重做时记录 repair.cause 和 repair.action。plan 会按原因给修复路线并统计已复核的修复通过率。通过率仅代表记录过的试次。

色差检查使用 D65 下的 sRGB 转 Lab 与 ΔE76。选择同一块布料、可比光线与白平衡下的样本，避免阴影、亮斑和接缝。配置如下：

```json
{
  "reference": "assets/reference.jpg",
  "image": "assets/S01-r1.jpg",
  "referenceRect": [0.38, 0.36, 0.08, 0.08],
  "imageRect": [0.38, 0.36, 0.08, 0.08],
  "threshold": 5,
  "matchedLighting": false
}
```

```sh
node scripts/project.cjs color project.json --config swatches.json > color-report.json
```

仅在本项目认可的条件下设置 matchedLighting。阈值由项目指定，5 只是示例。超过阈值且条件合格时判 fail，光线未对齐、色块不均或剪切时判 unknown。用 `quality.color: {"referenceView":"front","threshold":5,"shots":["S01"]}` 指定强制复核的镜头，再把报告路径写到 attempt.colorReport。报告绑定参考与成片的哈希，换图后应重测。它测的是所选照片色块，不能代替实物色卡或商业签样。

## 文案、标识与数据回流

`copy` 生成标题、正文、话题、逐页 alt text。文案利益项用 copy.benefits 的 point 关联已验收的卖点，未通过的卖点不会被自动用作利益文案。交付同时生成 copy.md 与 copy.json。alt 尽量按所见录入 page.alt，未录入的草稿会提示复查。

`publication.aiContent` 记录是否含 AI 内容，visibleLabel 可以为导出的图片加可见标识。交付清单单独记录图片标识、平台标识与待办，平台标识只有凭证录入后才显示已确认。真人人物档案使用 kind=real，并保留 consent.status、evidence 和 scope。项目保留原始有标识文件。PNG 或 SVG 再排版不继承原件的密码学来源凭证，按发布平台功能主动声明，并复核已有标识是否仍可见。国内规则见 [《人工智能生成合成内容标识办法》](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)。Meta 的标签机制见 [Meta 官方说明](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/)。

发布后把平台真实数据放进 feedback，或使用以下命令写出一个项目副本：

```sh
node scripts/project.cjs record-feedback project.json --config observed.json --out project-with-feedback.json
node scripts/project.cjs feedback project-with-feedback.json
```

每条记录含 platform、window、cover、impressions、saves、clicks，可另录 commentKeywords。封面 A/B 两条用相同 experiment、platform、window、control，cover 分开。保存率和点击率按展示数计算。脚本输出分母和率差，样本少或投放条件变化时应复核再写入品牌档案。

## 新建和校验项目

用 `node scripts/project.cjs init ./new-project --mode product` 建立项目单、三份档案和素材目录；目标目录需要尚未存在。将素材放入该项目后，运行 `node scripts/project.cjs validate ./new-project/project.json` 检查项目结构、档案和编号。`validate` 汇总字段错误，`plan` 另列创意和素材缺口。

项目单和档案支持编辑器提示，见 [项目](../schema/project.schema.json)、[人物](../schema/person.schema.json)、[品牌](../schema/brand.schema.json) 和 [商品](../schema/product.schema.json) 的 Schema。

## 检查文案用词

`node scripts/project.cjs copy-lint project.json` 扫描标题、正文、话题和逐页 alt text，返回命中词、位置、等级和替换建议。`index` 是原字段文本中第一次有效命中的位置，从 0 开始，可用于 JavaScript 字符串定位。`copy` 和 `deliver` 也会记录检查结果，默认仅提醒，`--strict` 遇到 block 时退出，交付目录不会被创建。词表可在 [文案风险词](../data/copy-risk-words.json) 更新。规则只提示字面风险，文案仍按可核实的画面和发布规则审核。
