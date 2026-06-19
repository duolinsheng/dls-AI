# dls-ai-main（目录名：`main`）

多邻省 AI 学习助手（MVP）：

- 基础 AI 对话
- 上海话 / 中文 互译

## 1. 本地运行

### 使用 npm（推荐）

```bash
# 在仓库根目录 dls-AI
cd dls-AI
npm install
npm start
```

然后访问 `http://localhost:8080`。

兼容旧方式（仍可用）：

```bash
cd main
npm start
```

### 其他方式

这是纯前端静态项目，也可以直接打开 `index.html` 即可使用。

## 2. 模型配置说明

页面中可配置：

- `API 配置文件`（JSON 上传，含 `apiKey`）
- `Base URL`（默认：`http://localhost:11434`）
- `Model`（默认：`qwen3.5:4b`）

DeepSeek 可选择页面里的“连接方式 -> DeepSeek”，会自动填入：

- `Base URL`: `https://api.deepseek.com/v1`
- `Model`: `deepseek-chat`

保存后会写入浏览器 `localStorage`。

如果不配置 API Key（本地 Ollama 可不上传）：

- AI 对话功能会提示先配置
- 互译功能会自动使用本地基础词典兜底（仅用于演示，准确性有限）

## 3. GitHub Pages 部署

仓库已提供 GitHub Actions 工作流：`.github/workflows/deploy-pages.yml`。  
推送到 `main` 分支后自动部署 `main` 目录到 Pages。

你需要在 GitHub 仓库设置里确认：

1. `Settings` -> `Pages` -> `Build and deployment` 选择 `GitHub Actions`
2. 等待 `Deploy static site to Pages` 工作流成功
3. 访问生成的 Pages 链接
