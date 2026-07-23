# 测试与失败记录

本文件是作品集入口；每次可重复运行的详细输出由 `npm run eval` 写入 `eval/eval_results_v1.json`，请求观测由 `logs/run_log.jsonl` 记录。

## 正常场景

| 场景 | 执行方式 | 预期 |
| --- | --- | --- |
| 服务健康检查 | `health-001` | 返回安全与 TLS 配置 |
| 工具注册 | `tools-001` | MCP 工具列表包含声调工具 |
| 粤语声调指南 | `tone-001` | 返回标题、说明与例字 |
| 随机学习挑战 | `challenge-001` | 返回题目和答案 |
| 学习进度摘要 | `progress-001` | 正确汇总输入统计 |
| 用户注册和登录 | `auth-api-test.mjs` | 临时账号可注册、登录并读取受保护数据 |

## 失败/异常场景

| 场景 | 期望行为 | 处理方式 |
| --- | --- | --- |
| 有害请求 | 命中 `harmful` 规则并拒绝 | 返回限制说明，写入脱敏安全事件 |
| 非法 JSON | 返回 HTTP 400 | MCP 请求体解析失败后不执行工具 |
| 未知路由 | 返回 HTTP 404 | 不暴露内部实现 |
| AI 审核未配置或不可用 | 对受审核工具 fail-closed | 明确拒绝，不使用不受控的本地规则模拟放行 |

## 运行与复核

```bash
$env:GUARDRAIL_AI_ENABLED="0"; npm start
# 新开终端
npm run eval
node eval/auth-api-test.mjs
npm run metrics
```

最近一次运行的异常证据见 [logs/failure_log.md](logs/failure_log.md)。模型翻译质量不在上述离线接口测试的结论范围内，须在可用模型环境使用人工标注方言样本评估。
