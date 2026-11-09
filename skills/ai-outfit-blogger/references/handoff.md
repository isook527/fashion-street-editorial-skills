# 出图侧交接表

把参考、镜头和每次验收放在同一份项目单。文件路径以项目单所在目录为基准。人物和商品档案由项目维护。

| 字段 | 填写内容 |
| --- | --- |
| `version` | 当前项目单固定为 `1`。 |
| `mode` | 商品保真填 `product`，创意街拍填 `creative`。 |
| `profiles` | `person`、`brand`、`product` 分别指向本地档案。 |
| `tools` | `generate`、`multiReference`、`localEdit`、`video` 记录宿主已确认的能力。 |
| `request` | `kind` 为 `prompts`、`still` 或 `video`，可加 `count`、`ratio`、`edit`、`allowChanges`。 |
| `budget` | `maxAttempts`、`pilotSize` 控制尝试上限和首批大小，可同时填 `unitCost` 和 `costCap`。 |
| `pilot` | `shot` 填样张镜头号，用户确认后填 `confirmed: true`。 |
| `shots[].id` | 唯一的镜头号。 |
| `shots[].points` | 该镜头承担的商品卖点 ID。 |
| `shots[].attempts` | 按发生顺序记录每一稿，保留失败稿。 |
| `shots[].selected` | 已通过验收的稿号。 |
| `attempts[].id` | 镜头内唯一稿号。 |
| `attempts[].file` | 成图路径。 |
| `attempts[].checks` | 身份、服装、动作、裁切及关联卖点填写 `pass`、`fail` 或 `unknown`。 |
| `attempts[].note` | 写可核对的观察、缺项和补拍原因。 |
| `attempts[].prompt` | 保存实际提示词 `text`、版本 `version`、工具 `tool`、可见模型 `model` 与 `seed`。未知值填 `null`。 |
| `concept` | 概念句、三张参照、三个情绪词、光向、色温、街道、时段和调色。 |

```json
{
  "version": 1,
  "mode": "creative",
  "profiles": {},
  "tools": {"generate": false, "multiReference": false, "localEdit": false, "video": false},
  "request": {"kind": "prompts", "count": 9, "ratio": "3:4"},
  "budget": {"maxAttempts": 9, "pilotSize": 1},
  "pilot": {"confirmed": false},
  "concept": {"line": "店开门前的街角"},
  "shots": [{"id": "S01", "points": [], "attempts": []}]
}
```
