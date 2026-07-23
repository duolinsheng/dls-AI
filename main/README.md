# 前端模块

`main/` 是多邻省 AI 学习助手的浏览器端界面，提供方言对话、翻译、词典、练习、学习记录和模型配置。

支持的学习方言：粤语、台山话、闽南话/Hokkien、上海话、潮州话、温州话和四川话。

## 正确运行方式

完整功能依赖仓库根目录的 Node 服务，它提供认证、MCP 工具、安全护栏和本地模型代理：

```bash
# 在仓库根目录
npm install
npm start
```

访问 `http://localhost:8080`。

直接打开 `index.html` 只能浏览静态界面，不能使用认证、MCP 工具、请求日志或 `/api/*` 模型代理，因此不作为作品集演示方式。

## 模型配置

页面可配置 OpenAI 兼容接口或 Ollama：

- Base URL 默认是 `http://localhost:11434`
- 默认模型为 `qwen3.5:4b`
- OpenAI 兼容服务通常使用 `https://api.openai.com/v1` 等 API 根地址

配置保存在浏览器 `localStorage`；不要在录屏、截图或提交内容中暴露 API Key。

## 部署边界

GitHub Pages 工作流只发布本目录的静态文件。因此 Pages 版本不包含 Node 服务提供的认证、MCP、安全护栏、日志和模型代理；完整项目请使用 Node 服务部署。

完整项目说明、评测与演示材料见仓库根目录 [README](../README.md)。
