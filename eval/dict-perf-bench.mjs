/**
 * 词典加载与搜索性能基准（优化前后对比）
 * 运行：node eval/dict-perf-bench.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const READ_DIR = path.join(__dirname, "../main/read");

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseSimpleTwoColumnLine(line) {
  const commaIdx = line.indexOf(",");
  if (commaIdx === -1) return null;
  const word = line.slice(0, commaIdx).trim();
  const pinyin = line.slice(commaIdx + 1).trim();
  if (!word || !pinyin) return null;
  return [word, pinyin];
}

function loadDictionary({ fastCsv }) {
  const yyzdText = fs.readFileSync(path.join(READ_DIR, "yyzd.csv"), "utf8");
  const wordListText = fs.readFileSync(path.join(READ_DIR, "word_list.csv"), "utf8");
  const yyzdLines = yyzdText.split(/\r?\n/);
  const wordListLines = wordListText.split(/\r?\n/);
  const dedupe = new Set();
  const yueDictionary = [];

  const addEntry = (entry) => {
    const simp = (entry.simp || "").trim();
    const trad = (entry.trad || "").trim();
    const pinyin = (entry.pinyin || "").trim();
    if (!simp || !pinyin) return;
    const dedupeKey = `${simp}|${trad || simp}|${pinyin}|${entry.example}|${entry.explanation}|${entry.alt}`;
    if (dedupe.has(dedupeKey)) return;
    dedupe.add(dedupeKey);
    yueDictionary.push({ simp, trad: trad || simp, pinyin, example: entry.example || "", explanation: entry.explanation || "", alt: entry.alt || "" });
  };

  for (let i = 1; i < yyzdLines.length; i++) {
    const line = yyzdLines[i].trim();
    if (!line) continue;
    const parts = parseCsvLine(line);
    if (parts.length < 3) continue;
    addEntry({ simp: parts[0], trad: parts[1], pinyin: parts[2], example: parts[3] || "", explanation: parts[4] || "", alt: parts[5] || "" });
  }

  for (let i = 1; i < wordListLines.length; i++) {
    const line = wordListLines[i].trim();
    if (!line) continue;
    const parts = fastCsv ? parseSimpleTwoColumnLine(line) : parseCsvLine(line);
    if (!parts || parts.length < 2) continue;
    addEntry({ simp: parts[0], trad: parts[0], pinyin: parts[1], example: "", explanation: "", alt: "" });
  }

  return yueDictionary;
}

function buildOldSearchContext(dict) {
  const normalize = (text) => (text || "").trim();
  return { dict, normalize };
}

function buildNewSearchContext(dict) {
  const exactIndex = new Map();
  const byContainingChar = new Map();
  for (const entry of dict) {
    entry.normSimp = entry.simp;
    entry.normTrad = entry.trad;
    for (const key of [entry.simp, entry.trad]) {
      if (!exactIndex.has(key)) exactIndex.set(key, []);
      exactIndex.get(key).push(entry);
    }
    const chars = new Set([...entry.simp, ...entry.trad]);
    for (const ch of chars) {
      if (!/[\u4e00-\u9fff]/.test(ch)) continue;
      if (!byContainingChar.has(ch)) byContainingChar.set(ch, []);
      byContainingChar.get(ch).push(entry);
    }
  }
  return { dict, exactIndex, byContainingChar, normalize: (t) => (t || "").trim() };
}

function searchOld(ctx, query) {
  const { dict, normalize } = ctx;
  const normalizedQuery = normalize(query);
  const resultMap = new Map();
  const addResult = (item) => {
    const key = `${item.simp}|${item.trad}|${item.pinyin}`;
    if (!resultMap.has(key)) resultMap.set(key, item);
  };
  const isExact = (item, text) => item.simp === text || item.trad === text;
  const isContains = (item, text) => item.simp.includes(text) || item.trad.includes(text);

  for (const item of dict) if (isExact(item, normalizedQuery)) addResult(item);
  for (const item of dict) if (isContains(item, normalizedQuery)) addResult(item);

  const singleChars = [...new Set(normalizedQuery.match(/[\u4e00-\u9fff]/g) || [])];
  if (singleChars.length > 1) {
    for (const ch of singleChars) {
      for (const item of dict) if (isExact(item, ch)) addResult(item);
    }
    for (const ch of singleChars) {
      for (const item of dict) if (isContains(item, ch)) addResult(item);
    }
  }
  return resultMap.size;
}

function searchNew(ctx, query) {
  const { dict, exactIndex, byContainingChar, normalize } = ctx;
  const normalizedQuery = normalize(query);
  const resultMap = new Map();
  const addResult = (item) => {
    const key = `${item.simp}|${item.trad}|${item.pinyin}`;
    if (!resultMap.has(key)) resultMap.set(key, item);
  };
  const isContains = (item, text) => item.normSimp.includes(text) || item.normTrad.includes(text);

  for (const item of exactIndex.get(normalizedQuery) || []) addResult(item);
  for (const item of dict) if (isContains(item, normalizedQuery)) addResult(item);

  const singleChars = [...new Set(normalizedQuery.match(/[\u4e00-\u9fff]/g) || [])];
  if (singleChars.length > 1) {
    for (const ch of singleChars) {
      for (const item of exactIndex.get(ch) || []) addResult(item);
    }
    for (const ch of singleChars) {
      for (const item of byContainingChar.get(ch) || []) {
        if (isContains(item, ch)) addResult(item);
      }
    }
  }
  return resultMap.size;
}

function bench(label, fn, iterations = 1) {
  const start = performance.now();
  let result;
  for (let i = 0; i < iterations; i++) result = fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(1)} ms${iterations > 1 ? ` (${iterations} 次)` : ""}`, result !== undefined && typeof result === "number" ? `(结果数 ${result})` : "");
  return ms;
}

console.log("=== 词典性能基准 ===\n");

const loadOldMs = bench("加载（旧 CSV 解析）", () => loadDictionary({ fastCsv: false }));
const loadNewMs = bench("加载（新快速解析 + 索引）", () => {
  const dict = loadDictionary({ fastCsv: true });
  buildNewSearchContext(dict);
  return dict.length;
});

const dictOld = loadDictionary({ fastCsv: false });
const dictNew = loadDictionary({ fastCsv: true });
const oldCtx = buildOldSearchContext(dictOld);
const newCtx = buildNewSearchContext(dictNew);

console.log(`\n词条总数: ${dictNew.length}\n`);

const queries = ["你好", "马", "学习", "马克思"];
for (const q of queries) {
  console.log(`查询「${q}」:`);
  bench("  旧搜索 (50次)", () => searchOld(oldCtx, q), 50);
  bench("  新搜索 (50次)", () => searchNew(newCtx, q), 50);
  console.log("");
}

console.log("--- 汇总 ---");
console.log(`加载提速: ${((loadOldMs - loadNewMs) / loadOldMs * 100).toFixed(0)}%`);
