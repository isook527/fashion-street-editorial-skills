# 接单、出图与交付

一份 `project.json` 贯穿接单、试图、选片和排版。文件路径以项目单所在目录为基准。人物、品牌和商品各维护一份档案；真实素材和生成结果放在用户自己的项目里。仓库内的 仓库的 examples/short-jacket/project.json 样例 使用虚构人物和自制商品参考。

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
