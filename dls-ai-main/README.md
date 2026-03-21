# dls-ai-main

多邻省 AI 学习助手（MVP）：

- 基础 AI 对话
- 上海话 / 中文 互译

## 1. 本地运行

这是纯前端静态项目，直接打开 `index.html` 即可使用。  
也可以使用任意静态服务器运行，例如：

```bash
cd dls-ai-main
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 2. 模型配置说明

页面中可配置：

- `API Key`
- `Base URL`（默认：`https://api.openai.com/v1`）
- `Model`（默认：`gpt-4o-mini`）

保存后会写入浏览器 `localStorage`。

如果不填 API Key：

- AI 对话功能会提示先配置
- 互译功能会自动使用本地基础词典兜底（仅用于演示，准确性有限）

## 3. GitHub Pages 部署

仓库已提供 GitHub Actions 工作流：`.github/workflows/deploy-pages.yml`。  
推送到 `main` 分支后自动部署 `dls-ai-main` 目录到 Pages。

你需要在 GitHub 仓库设置里确认：

1. `Settings` -> `Pages` -> `Build and deployment` 选择 `GitHub Actions`
2. 等待 `Deploy static site to Pages` 工作流成功
3. 访问生成的 Pages 链接
