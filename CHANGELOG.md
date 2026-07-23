# Changelog

本记录以可核查的 Git 历史和仓库交付物为依据，不补写不可验证的历史日期。

## Unreleased

### Added
- 新增可重复 MCP 接口评测 `eval/run-evaluation.mjs`，生成 JSON、CSV 和评测运行日志。
- 新增请求级 JSONL 观测与 `npm run metrics` 指标汇总。
- 新增失败归档、LLM 工程说明、架构/API 文档、里程碑与最终复盘。
- 新增 2 分钟真实演示录制脚本。

### Changed
- 认证回归测试改用动态临时用户名，避免历史运行残留数据导致不稳定。
- README 调整为作品集入口，链接运行、评测、失败证据和演示材料。

## 已有提交摘录

- `ed1fe4e` Last update
- `a161cda` Implement retry logic for GitHub Pages deployment
- `06ef7f3` feat: 修改 CSS 问题
- `710524b` feat: 改进并实施 GitHub 项目

完整历史请执行 `git log --oneline` 查看。
