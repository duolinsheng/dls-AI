# dls-AI：基于多邻省制作的AI方言学习软件

面向方言学习者的 AI Web 应用：把模型对话、方言词典、学习练习、记忆、工具调用和安全护栏组合为一个可运行、可测试的学习闭环。

## 项目定位

- **目标用户**：需要学习或理解粤语、台山话、闽南话、上海话、潮州话、温州话、四川话的普通学习者。
- **解决的问题**：通用模型缺乏可追溯的方言资料与学习练习流程；项目以结构化词典工具补充模型输出，并提供安全与失败证据。
- **边界**：不宣称替代语言教师或保证所有方言生成的语言学准确性；模型输出应由母语者或可靠资料复核。

### 核心功能

- **AI 对话与翻译**：可配置 OpenAI 兼容接口或本地 Ollama，按方言设置提示、注音和输出格式。
- **MCP 工具**：词典检索、声调、例句、方言对比、练习题、学习进度与本地记忆。
- **协同 Agent**：协调器、词典研究器与安全审查器并行处理学习任务，安全分支拥有否决权。
- **安全与可观测性**：规则与可选 AI 审核、脱敏日志、请求 ID、失败归档和可重复接口评测。

## 🏗️ 项目结构

```
dls-AI/
├── main/                 # 核心应用模块（Web 界面）
│   ├── index.html        # 主页面
│   ├── styles.css        # 样式文件
│   ├── app.js            # 应用逻辑
│   └── README.md         # 应用详细说明
├── docs/                 # 文档模块（架构设计、说明文档）
├── eval/                 # 评测模块（测试数据、评分标准）
├── logs/                 # 日志模块（运行日志、错误记录）
├── demo/                 # 演示模块（演示视频、讲稿）
├── reflection/           # 反思模块（课程反思、迭代记录）
│   └── lesson_reflection/
└── README.md             # 本文件
```

## 🚀 快速开始

### 使用本地服务（推荐）

```bash
npm install
npm start
```

然后访问 `http://localhost:8080`。

### 复现评测与日志

```bash
# PowerShell：为离线评测关闭需要本机模型的 AI 审核
$env:GUARDRAIL_AI_ENABLED="0"; npm start
# 新开一个终端
npm run eval
node eval/auth-api-test.mjs
npm run metrics
```

`npm run eval` 会重写 `eval/eval_results_v1.json` 和 `eval/eval_sheet_v1.csv`；`npm run metrics` 从请求元数据生成 `logs/runtime_metrics.json`。

## ⚙️ 配置说明

在应用界面中可配置以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| API Key | 空 | AI 服务密钥（可选） |
| Base URL | `http://localhost:11434` | AI 服务地址 |
| Model | `qwen3.5:4b` | 使用的模型名称 |

### 常用配置示例

**使用 DeepSeek:**
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat` 或 `deepseek-reasoner`
- API Key: 填写 DeepSeek 平台创建的密钥

**使用 OpenAI:**
- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`

**使用本地 Ollama:**
- Base URL: `http://localhost:11434`
- Model: `qwen3.5:4b`

配置会自动保存到浏览器的 `localStorage`。

## 🎯 使用场景

### 1. 方言学习
- 输入中文，获取目标方言翻译或解释
- 输入方言，理解其含义
- 与 AI 助手进行方言学习对话

### 2. 语言对比研究
- 对比上海话和粤语的表达差异
- 探索不同方言间的转换规律

### 3. 无网络环境
- 不配置 API Key 时，自动使用本地词典兜底
- 适合基础词汇的快速查询

## 展示证据

- [LLM 工程说明](LLM_ENGINEERING_NOTES.md)：Prompt、结构化检索、Tool、Agent、Memory、安全与降级设计。
- [架构与 API](docs/architecture_and_api.md)：浏览器、Node、MCP、模型与数据边界。
- [评测结果](eval/eval_results_v1.json) 与 [评测表](eval/eval_sheet_v1.csv)：由 `npm run eval` 实际生成。
- [失败与异常归档](logs/failure_log.md) 与 [运行指标](logs/runtime_metrics.json)：安全拦截、非法输入、路由边界和请求观测。
- [测试与失败记录](TEST_AND_FAILURE_LOG.md) 与 [迭代记录](CHANGELOG.md)：可复现测试范围和演进证据。
- [2 分钟演示脚本](demo/demo_script.md)：录制真实运行视频的镜头与旁白。

> 待补充：录制完成后，将 `demo/demo_video.mp4` 或公开视频链接添加在这里，并把首页、核心功能、安全/评测截图保存到 `demo/screenshots/`。

## 🔍 技术特点

- **前后端协作**: 浏览器界面配合 Node 服务提供认证、MCP、护栏、日志和本地模型代理
- **结构化检索增强**: AI 模型结合本地方言词典与 MCP 工具，不将词典匹配误称为完整向量 RAG
- **响应式设计**: 简洁友好的用户界面
- **隐私保护**: 浏览器配置保存在本地；服务日志不记录密码、令牌、API Key 或完整请求内容

## 📝 开发说明

### 核心组件

- [`app.js`](main/app.js): 包含对话、翻译、配置管理等核心逻辑
- [`index.html`](main/index.html): 应用主界面
- [`styles.css`](main/styles.css): 样式定义

### 支持范围

界面支持粤语、台山话、闽南话/Hokkien、上海话、潮州话、温州话、四川话的学习与翻译提示；不同方言的词典覆盖度不同。服务端 MCP 工具可提供词典检索、声调、例句、对比、练习与学习进度。

## 🛠️ 扩展建议

### 短期优化
- [ ] 增加词汇分类标签和可追溯的资料来源版本
- [ ] 补全各方言的词典、音频与题库覆盖
- [ ] 建立母语者人工标注的小规模质量集

### 中期目标
- [ ] 集成语音识别（STT）
- [x] 添加用户学习进度跟踪
- [ ] 提供方言文化背景介绍与人工审核来源

### 长期愿景
- [  ] 为更多方言补充本地词典、发音和题库数据
- [  ] 构建社区贡献的方言数据库
- [  ] 开发移动端应用

## 📖 相关文档

- [核心应用详细说明](main/README.md)
- [课程反思记录](reflection/lesson_reflection/)
- [架构与 API](docs/architecture_and_api.md)
- [评测与运行说明](eval/README.md)

## 🤝 参与贡献

这是一个学生项目模板，欢迎基于此框架继续完善：

1. Fork 本项目
2. 在对应目录添加内容（文档、评测、日志等）
3. 提交 Pull Request

## 📄 许可证

本项目为学生学习项目，仅供学习交流使用。

---

**💡 提示**: 本项目强调"过程导向"，鼓励记录失败过程和迭代改进，而不仅仅是最终结果。详细的开发过程记录比完美的最终展示更有价值。
