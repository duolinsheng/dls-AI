# M4 复盘：作品集可复现交付

## 目标与结果

补齐可运行证据、评测执行器、结构化请求日志、失败归档、架构/API 说明及演示脚本。主要证据：

- `npm run eval` 生成 `eval/eval_results_v1.json` 与 `eval/eval_sheet_v1.csv`；
- `logs/run_log.jsonl` 和 `npm run metrics` 生成请求观测数据；
- `logs/failure_log.md` 保存异常与安全边界案例；
- `LLM_ENGINEERING_NOTES.md` 与 `docs/architecture_and_api.md` 记录工程设计。

## 关键判断

测试结果必须由脚本实际运行生成，不能手写通过率；明确区分“接口正确性”与“模型翻译质量”。因此当前离线评测验证的是确定性工具、输入校验和硬安全规则，不宣称替代人工方言评估。

## 仍未完成

真实两分钟演示视频需要在本机配置模型后录制；视频链接和截图应在录制后补入 README。
