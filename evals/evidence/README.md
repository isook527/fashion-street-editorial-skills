# 公开评测证据

[脱敏答卷与评分](codex-2026-11-09.json)按任务、是否安装 Skill 和试次保存答卷。每条 `rubric` 中的 `item` 是对应任务 `rubric.md` 的条目编号，`score` 为 0 或 1。`model` 为 null 表示 CLI 记录未显示模型名。公开答卷删除机器绝对路径和会话元数据，完整原始日志保留在本地。

按 [评测方法](../README.md) 对照任务输入、评分规则与答卷，可人工复核分数。运行 `node evals/evidence/check.cjs` 可核对每组试次数、评分项及其在 [评测结果](../../docs/evals.md) 中的总计。
