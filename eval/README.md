# eval 使用说明

本目录用于存放评测数据、评测脚本与评测结果。

## 文件清单

| 文件 | 说明 |
|------|------|
| `data/users.seed.json` | 种子账号（demo / testuser / learner），首次启动 server 写入 `data/users.json` |
| `data/user-data.seed.json` | demo 用户示例学习数据 |
| `auth-test-cases.json` | 登录/注册 API 测试用例 |
| `auth-api-test.mjs` | 认证 API 自动化测试脚本 |
| `eval_set_v1.json` | 翻译/对话/词典评测样本集 |
| `eval_sheet_v1.csv` | 评测结果记录表 |
| `dict-perf-bench.mjs` | 词典性能基准脚本 |

## 运行认证测试

```bash
node server.js
# 另开终端
node eval/auth-api-test.mjs
```

## 测试账号

| 用户名 | 密码 | 说明 |
|--------|------|------|
| demo | demo123 | 学生 |
| testuser | test123 | 家长 |
| learner | learn2026 | 老师 |

管理员账号 `admin114514Chessbrain` 由系统种子初始化，**不可公开注册**。

## 最低提交标准

1. 至少 1 份评测样本集（`eval_set_v1.json`）
2. 至少 1 份可读的评测结果表（`eval_sheet_v1.csv`）
3. 至少 2 个失败案例及改进动作
