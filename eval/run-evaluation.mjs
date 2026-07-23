/**
 * 可重复的 MCP 接口评测。
 * 运行：先以 GUARDRAIL_AI_ENABLED=0 node server.js 启动服务，再执行 node eval/run-evaluation.mjs。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const logsDir = path.join(rootDir, "logs");
const source = JSON.parse(fs.readFileSync(path.join(__dirname, "eval_set_v1.json"), "utf8"));
const baseUrl = (process.env.EVAL_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

fs.mkdirSync(logsDir, { recursive: true });

function valueAtPath(value, dotPath) {
  return dotPath.split(".").reduce((current, key) => current?.[key], value);
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
}

function preview(value, max = 180) {
  const text = JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function assertSample(sample, response) {
  const expected = sample.expect || {};
  const issues = [];
  if (response.status !== expected.status) {
    issues.push(`状态码期望 ${expected.status}，实际 ${response.status}`);
  }
  for (const field of expected.fields || []) {
    if (valueAtPath(response.data, field) === undefined) issues.push(`缺少字段 ${field}`);
  }
  if (expected.tool && !response.data?.tools?.some((tool) => tool.name === expected.tool)) {
    issues.push(`未注册工具 ${expected.tool}`);
  }
  for (const field of expected.resultFields || []) {
    if (valueAtPath(response.data?.result, field) === undefined) issues.push(`缺少 result.${field}`);
  }
  if (expected.minResultCount && (!Array.isArray(response.data?.result) || response.data.result.length < expected.minResultCount)) {
    issues.push(`结果数量少于 ${expected.minResultCount}`);
  }
  if (expected.allowed !== undefined && response.data?.allowed !== expected.allowed) {
    issues.push(`allowed 期望 ${expected.allowed}，实际 ${response.data?.allowed}`);
  }
  if (expected.violation && !response.data?.violations?.some((item) => item.id === expected.violation)) {
    issues.push(`未命中安全规则 ${expected.violation}`);
  }
  return issues;
}

async function execute(sample) {
  const startedAt = Date.now();
  const headers = {};
  let body;
  if (sample.rawBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = sample.rawBody;
  } else if (sample.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(sample.body);
  }

  try {
    const res = await fetch(`${baseUrl}${sample.path}`, { method: sample.method, headers, body });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    const response = { status: res.status, data, latencyMs: Date.now() - startedAt };
    const issues = assertSample(sample, response);
    return {
      id: sample.id,
      type: sample.type,
      path: sample.path,
      tags: sample.tags || [],
      ...response,
      passed: issues.length === 0,
      issues,
    };
  } catch (error) {
    return {
      id: sample.id,
      type: sample.type,
      path: sample.path,
      tags: sample.tags || [],
      status: 0,
      data: { error: error.message },
      latencyMs: Date.now() - startedAt,
      passed: false,
      issues: [`请求失败：${error.message}`],
    };
  }
}

const results = [];
for (const sample of source.samples) {
  const result = await execute(sample);
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} ${result.latencyMs}ms ${result.issues.join("; ")}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  total: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: results.filter((item) => !item.passed).length,
  averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
};
fs.writeFileSync(path.join(__dirname, "eval_results_v1.json"), JSON.stringify({ summary, results }, null, 2), "utf8");

const rows = [
  ["sample_id", "type", "path", "expected_status", "actual_status", "latency_ms", "pass", "failure_reason", "actual_output"],
  ...results.map((result) => {
    const sample = source.samples.find((item) => item.id === result.id);
    return [
      result.id,
      result.type,
      result.path,
      sample.expect.status,
      result.status,
      result.latencyMs,
      result.passed ? "true" : "false",
      result.issues.join("; "),
      preview(result.data),
    ];
  }),
];
fs.writeFileSync(path.join(__dirname, "eval_sheet_v1.csv"), `${rows.map((row) => row.map(csv).join(",")).join("\n")}\n`, "utf8");

const logLines = results.map((result) => JSON.stringify({
  timestamp: summary.generatedAt,
  source: "evaluation",
  sample_id: result.id,
  path: result.path,
  status: result.status,
  latency_ms: result.latencyMs,
  pass: result.passed,
  error_code: result.passed ? null : "assertion_failed",
}));
fs.writeFileSync(path.join(logsDir, "evaluation_run.jsonl"), `${logLines.join("\n")}\n`, "utf8");

const exceptionCases = results.filter((result) => result.tags.includes("异常") || result.tags.includes("预期拦截"));
const expectedProtection = {
  "safety-001": "拦截有害请求",
  "comparison-001": "在 AI 审核关闭时按 fail-closed 策略拒绝受审核工具",
  "invalid-json-001": "拒绝非 JSON 请求体",
  "not-found-001": "返回 404，不暴露内部路由",
};
const failureLog = [
  "# 失败与异常归档",
  "",
  `生成时间：${summary.generatedAt}`,
  "",
  "以下条目是预期的防御性行为，而非功能回归失败；完整原始结果见 `eval/eval_results_v1.json`。",
  "",
  "| 案例 | 触发条件 | 预期保护 | 实际状态 | 回归结果 |",
  "| --- | --- | --- | --- | --- |",
  ...exceptionCases.map((item) =>
    `| ${item.id} | ${item.tags.join("、")} | ${expectedProtection[item.id] || "按预期拒绝或返回错误"} | ${item.status} | ${item.passed ? "通过" : `失败：${item.issues.join("；")}`} |`,
  ),
  "",
  "## 已知限制与改进",
  "- 常规词典检索会经过 AI 安全审核；本地模型不可用时系统按 fail-closed 策略拒绝请求。评测使用 `GUARDRAIL_AI_ENABLED=0` 仅覆盖无需模型审核的确定性工具和硬规则。",
  "- 后续应在可用模型环境中增加独立的人工标注集，评测翻译准确性、方言自然度和安全审核召回率。",
  "",
];
fs.writeFileSync(path.join(logsDir, "failure_log.md"), failureLog.join("\n"), "utf8");

console.log(`\n评测完成：${summary.passed}/${summary.total} 通过，平均 ${summary.averageLatencyMs}ms。`);
process.exitCode = summary.failed > 0 ? 1 : 0;
