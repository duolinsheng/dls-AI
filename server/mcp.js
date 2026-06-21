const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  checkInput,
  checkOutput,
  logGuardrailEvent,
  submitFeedback,
  getGuardrailSummary,
} = require("./guardrails");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_DIR = path.join(DATA_DIR, "memory");
const MINNAN_DICT_FILE = path.join(__dirname, "..", "main", "read", "minnan_dictionary.csv");
const SHANGHAI_DICT_FILE = path.join(__dirname, "..", "main", "read", "shanghai_dictionary.csv");
const SICHUAN_DICT_FILE = path.join(__dirname, "..", "main", "read", "sichuan_dictionary.csv");
const YUE_DICT_FILE = path.join(__dirname, "..", "main", "read", "yyzd.csv");
const MEMORY_SALT = process.env.MCP_MEMORY_SALT || "dls-ai-memory-v1";

let dictionariesCache = null;

const tools = [
  {
    name: "get_user_progress",
    description: "获取当前用户的学习进度摘要，用于个性化安排下一轮方言练习。",
    inputSchema: {
      type: "object",
      properties: {
        progress: {
          type: "object",
          description: "前端本地或云端同步的学习统计数据。",
        },
      },
      additionalProperties: true,
    },
  },
  {
    name: "search_dialect_dictionary",
    description: "查询方言词典，返回词形、注音、释义。用户问某个词什么意思、怎么读时调用。",
    inputSchema: {
      type: "object",
      properties: {
        dialect: {
          type: "string",
          enum: ["yue", "minnan", "shanghai", "sichuan"],
          description: "方言代码：yue=粤语，minnan=闽南语/台语，shanghai=上海话，sichuan=四川话。",
        },
        query: {
          type: "string",
          minLength: 1,
          description: "要查询的汉字、注音或释义关键词。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 8,
        },
      },
      required: ["dialect", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_practice_quiz",
    description: "基于方言词典动态生成选择题练习。用户要求出题、练习、测验、考我时调用。返回可在对话中直接作答的题目列表。",
    inputSchema: {
      type: "object",
      properties: {
        dialect: {
          type: "string",
          enum: ["yue", "minnan", "shanghai", "sichuan"],
          default: "yue",
        },
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard"],
          default: "medium",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 5,
        },
      },
      additionalProperties: false,
    },
  },
];

function ensureMemoryDir() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  ensureMemoryDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }

  out.push(value);
  return out.map((item) => item.trim());
}

function loadMinnanDictionary() {
  const text = fs.existsSync(MINNAN_DICT_FILE)
    ? fs.readFileSync(MINNAN_DICT_FILE, "utf8")
    : "";

  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => parseCsvLine(line))
    .filter((parts) => parts.length >= 4 && parts[0])
    .map(([hanji, tailo, poj, zh, category, source]) => ({
      dialect: "minnan",
      term: hanji,
      trad: hanji,
      reading: tailo,
      altReading: poj,
      meaning: zh,
      category,
      source,
    }));
}

function loadRegionalDictionary(filePath, dialect) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => parseCsvLine(line))
    .filter((parts) => parts.length >= 4 && parts[0])
    .map(([term, romanization, ipa, zh, category, source]) => ({
      dialect,
      term,
      trad: term,
      reading: romanization,
      altReading: ipa,
      meaning: zh,
      category,
      source,
    }));
}

function loadYueDictionary() {
  const text = fs.existsSync(YUE_DICT_FILE) ? fs.readFileSync(YUE_DICT_FILE, "utf8") : "";

  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => parseCsvLine(line))
    .filter((parts) => parts.length >= 3 && parts[0])
    .slice(0, 3000)
    .map(([simp, trad, pinyin, example, explanation]) => ({
      dialect: "yue",
      term: simp,
      trad: trad || simp,
      reading: pinyin,
      altReading: "",
      meaning: explanation || example || "",
      category: "",
      source: "main/read/yyzd.csv",
    }));
}

function loadDictionaries() {
  if (!dictionariesCache) {
    dictionariesCache = {
      yue: loadYueDictionary(),
      minnan: loadMinnanDictionary(),
      shanghai: loadRegionalDictionary(SHANGHAI_DICT_FILE, "shanghai"),
      sichuan: loadRegionalDictionary(SICHUAN_DICT_FILE, "sichuan"),
    };
  }
  return dictionariesCache;
}

function normalizeText(text) {
  return String(text || "").trim().toLowerCase();
}

function searchDialectDictionary(args = {}) {
  const dialect = ["yue", "minnan", "shanghai", "sichuan"].includes(args.dialect)
    ? args.dialect
    : "yue";
  const query = normalizeText(args.query);
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  if (!query) return [];

  const entries = loadDictionaries()[dialect] || [];
  return entries
    .filter((entry) => {
      const haystack = [
        entry.term,
        entry.trad,
        entry.reading,
        entry.altReading,
        entry.meaning,
        entry.category,
      ]
        .map(normalizeText)
        .join(" ");
      return haystack.includes(query);
    })
    .slice(0, limit);
}

function generatePracticeQuiz(args = {}) {
  const dialect = ["yue", "minnan", "shanghai", "sichuan"].includes(args.dialect)
    ? args.dialect
    : "yue";
  const count = Math.min(Math.max(Number(args.count) || 5, 1), 10);
  const entries = (loadDictionaries()[dialect] || []).filter((entry) => entry.term && entry.meaning);
  const pool = [...entries].sort(() => Math.random() - 0.5).slice(0, Math.max(count * 4, count));

  return pool.slice(0, count).map((entry, index) => {
    const distractors = pool
      .filter((item) => item.term !== entry.term)
      .slice(index, index + 3)
      .map((item) => item.meaning || item.term);
    const options = [entry.meaning, ...distractors].slice(0, 4).sort(() => Math.random() - 0.5);
    return {
      question: `「${entry.term}」的意思是什么？${entry.reading ? `（${entry.reading}）` : ""}`,
      options,
      correct: Math.max(0, options.indexOf(entry.meaning)),
      answer: entry.meaning,
      dialect,
    };
  });
}

function summarizeProgress(args = {}) {
  const progress = args.progress || {};
  return {
    phrasesLearned: Number(progress.phrasesLearned || 0),
    quizCompleted: Number(progress.quizCompleted || progress.quizCount || 0),
    favoritesCount: Number(progress.favoritesCount || 0),
    wordbookCount: Number(progress.wordbookCount || 0),
    audioPlayed: Number(progress.audioPlayed || 0),
    checkinStreak: Number(progress.checkinStreak || 0),
  };
}

function sanitizeMemoryText(text) {
  return String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b\d{15,18}\b/g, "[id]")
    .slice(0, 240);
}

function deriveMemoryId(req, body = {}) {
  const key =
    body.userKey ||
    body.sessionId ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
    req.socket.remoteAddress ||
    "anonymous";
  return crypto.createHash("sha256").update(`${MEMORY_SALT}:${key}`).digest("hex");
}

function getMemoryPath(memoryId) {
  return path.join(MEMORY_DIR, `${memoryId}.json`);
}

function retrieveMemory(req, body = {}) {
  const startedAt = Date.now();
  const memoryId = deriveMemoryId(req, body);
  const store = readJsonFile(getMemoryPath(memoryId), { memories: [] });
  const queryTokens = new Set(String(body.query || "").match(/[\u4e00-\u9fff]|\w+/g) || []);
  const memories = (store.memories || [])
    .map((item) => {
      const score = [...queryTokens].reduce(
        (sum, token) => sum + (item.text && item.text.includes(token) ? 1 : 0),
        0,
      );
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, Math.min(Math.max(Number(body.limit) || 6, 1), 12));

  return { memories, latencyMs: Date.now() - startedAt };
}

function writeMemory(req, body = {}) {
  const memoryId = deriveMemoryId(req, body);
  const store = readJsonFile(getMemoryPath(memoryId), { memories: [] });
  const incoming = Array.isArray(body.facts) ? body.facts : [body.fact || body.text || ""];
  const now = Date.now();
  const existing = new Map((store.memories || []).map((item) => [item.text, item]));

  for (const raw of incoming) {
    const text = sanitizeMemoryText(raw);
    if (!text || text.length < 4) continue;
    existing.set(text, {
      id: crypto.createHash("sha1").update(text).digest("hex"),
      text,
      source: sanitizeMemoryText(body.source || "chat"),
      updatedAt: now,
    });
  }

  const memories = Array.from(existing.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 200);
  writeJsonFile(getMemoryPath(memoryId), { memories });
  return { ok: true, count: memories.length };
}

function clearMemory(req, body = {}) {
  const memoryId = deriveMemoryId(req, body);
  const filePath = getMemoryPath(memoryId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { ok: true };
}

async function validateToolArgs(name, args = {}) {
  if (name === "search_dialect_dictionary") {
    const queryCheck = await checkInput(String(args.query || ""), { source: "tool" });
    if (!queryCheck.allowed) {
      return { error: queryCheck.message || "词典查询参数未通过安全检查" };
    }
    return null;
  }
  return null;
}

async function callTool(name, args) {
  const validationError = await validateToolArgs(name, args);
  if (validationError) return validationError;

  if (name === "get_user_progress") return summarizeProgress(args);
  if (name === "search_dialect_dictionary") return searchDialectDictionary(args);
  if (name === "generate_practice_quiz") return generatePracticeQuiz(args);
  return { error: `Unknown tool: ${name}` };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(JSON.stringify(payload));
}

async function handleMcpRequest(req, res, requestPath) {
  try {
    if (requestPath === "/mcp/tools" && req.method === "GET") {
      return sendJson(res, 200, { tools });
    }

    if (requestPath === "/mcp/guardrail/check" && req.method === "POST") {
      const body = await readRequestBody(req);
      const stage = body.stage === "output" ? "output" : "input";
      const checkResult =
        stage === "output"
          ? await checkOutput(body.text, body.context)
          : await checkInput(body.text, body.context);
      logGuardrailEvent(req, body, checkResult);
      return sendJson(res, 200, checkResult);
    }

    if (requestPath === "/mcp/feedback" && req.method === "POST") {
      const body = await readRequestBody(req);
      return sendJson(res, 200, submitFeedback(req, body));
    }

    if (requestPath === "/mcp/feedback/summary" && req.method === "GET") {
      return sendJson(res, 200, getGuardrailSummary());
    }

    if (requestPath === "/mcp/call" && req.method === "POST") {
      const body = await readRequestBody(req);
      return sendJson(res, 200, {
        result: await callTool(body.tool || body.name, body.arguments || body.args || {}),
      });
    }

    if (requestPath === "/mcp/memory/retrieve" && req.method === "POST") {
      const body = await readRequestBody(req);
      return sendJson(res, 200, retrieveMemory(req, body));
    }

    if (requestPath === "/mcp/memory/write" && req.method === "POST") {
      const body = await readRequestBody(req);
      return sendJson(res, 200, writeMemory(req, body));
    }

    if (requestPath === "/mcp/memory" && req.method === "DELETE") {
      const body = await readRequestBody(req);
      return sendJson(res, 200, clearMemory(req, body));
    }

    if (requestPath === "/mcp" && req.method === "POST") {
      const body = await readRequestBody(req);
      if (body.method === "initialize") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "dls-ai-mcp", version: "1.0.0" },
            capabilities: { tools: {} },
          },
        });
      }
      if (body.method === "tools/list") {
        return sendJson(res, 200, { jsonrpc: "2.0", id: body.id, result: { tools } });
      }
      if (body.method === "tools/call") {
        const params = body.params || {};
        const toolResult = await callTool(params.name, params.arguments || {});
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2),
              },
            ],
          },
        });
      }
      return sendJson(res, 404, {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: "Method not found" },
      });
    }

    return sendJson(res, 404, { error: "Not Found" });
  } catch (err) {
    if (err.message === "Invalid JSON") {
      return sendJson(res, 400, { error: "请求体不是有效 JSON" });
    }
    console.error("[McpError]", err);
    return sendJson(res, 500, { error: "MCP server error" });
  }
}

module.exports = {
  handleMcpRequest,
  tools,
};
