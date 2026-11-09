# Contributing

## Develop locally

Run these commands from the repository root with Node.js 20.9 or later.

```sh
npm ci --prefix skills/ins-editorial-layout
npm run fonts --prefix skills/ins-editorial-layout
node scripts/dev/lint-skills.cjs
node --test tests/*.test.cjs
```

## Add a layout

Add the layout and its safe regions in `skills/ins-editorial-layout/scripts/advanced-layout.cjs` or `skills/ins-editorial-layout/scripts/layouts.cjs`. Document the template, image count, and supported options in the [layout catalog](skills/ins-editorial-layout/references/layouts.md) and [edition guide](skills/ins-editorial-layout/references/editions.md). Add a render test that uses the new layout and checks the intended output.

## Add a copy risk rule

Add a term to [copy-risk-words.json](skills/ins-editorial-layout/data/copy-risk-words.json). Include `category`, `severity`, and `suggestion`. Use `block` for claimed effects or medical promises and `warn` for the other categories. Add `except` for ordinary phrases that contain the term. In the PR, include one example that should match and one that should pass. For `第一`, use `销量第一` as the match and `第一次` as the exception.

## Prepare a release

Choose the version in `skills/ins-editorial-layout/package.json` and synchronize the lockfile and both Skill metadata entries. Lint checks their versions against [CHANGELOG.md](CHANGELOG.md). Record the changes under the matching version. Run `node scripts/dev/package.cjs X.Y.Z` from a Git checkout with the project fonts installed. Push a `vX.Y.Z` tag after verification so GitHub Actions can create the Release.

## Submit sample assets

Use fictional people or include authorization for recognizable people. Include a source or authorization note for submitted material. Submit examples without real brand logos.

## 中文摘要

从仓库根目录安装依赖和字体，运行 lint 和测试。添加版式时同时更新版式与多平台说明，并补一个渲染测试。添加风险词时写明类别、严重级别和替换建议，附一条应命中和一条应放行的用例。版本号以 `package.json` 为准，同步锁文件、Skill 元数据和变更日志。提交素材时说明来源及授权，使用虚构人物或已获授权的人物，避免真实品牌标识。
