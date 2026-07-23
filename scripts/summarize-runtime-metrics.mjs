/**
 * 汇总服务请求日志，不读取请求体、凭据或用户输入。
 * 运行：node scripts/summarize-runtime-metrics.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logsDir = path.join(rootDir, "logs");
const inputFile = path.join(logsDir, "run_log.jsonl");
const outputFile = path.join(logsDir, "runtime_metrics.json");

const entries = fs.existsSync(inputFile)
  ? fs.readFileSync(inputFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
  : [];

const total = entries.length;
const successful = entries.filter((item) => item.status >= 200 && item.status < 400);
const failed = entries.filter((item) => item.status >= 400);
const latency = entries.map((item) => Number(item.latency_ms) || 0).sort((a, b) => a - b);
const percentile = (ratio) => latency.length ? latency[Math.min(latency.length - 1, Math.floor(latency.length * ratio))] : 0;
const byPath = Object.fromEntries(
  [...new Set(entries.map((item) => item.path))].sort().map((route) => {
    const routeEntries = entries.filter((item) => item.path === route);
    return [route, {
      requests: routeEntries.length,
      errors: routeEntries.filter((item) => item.status >= 400).length,
      average_latency_ms: Math.round(routeEntries.reduce((sum, item) => sum + (Number(item.latency_ms) || 0), 0) / routeEntries.length),
    }];
  }),
);

const metrics = {
  generated_at: new Date().toISOString(),
  source: "logs/run_log.jsonl",
  total_requests: total,
  successful_requests: successful.length,
  failed_requests: failed.length,
  success_rate: total ? Number((successful.length / total).toFixed(4)) : null,
  average_latency_ms: total ? Math.round(latency.reduce((sum, item) => sum + item, 0) / total) : null,
  p50_latency_ms: percentile(0.5),
  p95_latency_ms: percentile(0.95),
  by_path: byPath,
};

fs.mkdirSync(logsDir, { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
console.log(JSON.stringify(metrics, null, 2));
