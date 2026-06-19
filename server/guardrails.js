const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { judgeWithAI, AI_ENABLED, GUARDRAIL_MODEL } = require("./guardrail-judge");

const DATA_DIR = path.join(__dirname, "..", "data");
const FEEDBACK_DIR = path.join(DATA_DIR, "feedback");
const GUARDRAIL_LOG_DIR = path.join(DATA_DIR, "guardrails");
const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_LENGTH = 12000;
const MAX_FEEDBACK_PER_DAY = 200;

const HARD_INPUT_RULES = [
  {
    id: "pii_request",
    severity: "block",
    pattern: /(身份证|银行卡|信用卡).*(号|号码)|告诉我.*(密码|pin码)|社工库|开盒/i,
    message: "无法协助获取或处理个人敏感信息。",
  },
];

const HARD_OUTPUT_RULES = [
  {
    id: "pii_leak",
    severity: "block",
    pattern: /\b1[3-9]\d{9}\b|\b\d{15,18}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    message: "回复可能包含个人敏感信息，已被安全策略拦截。",
  },
  {
    id: "credential_leak",
    severity: "block",
    pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i,
    message: "回复可能包含敏感凭据，已被拦截。",
  },
];

const FALLBACK_SEMANTIC_RULES = {
  input: [
    {
      id: "jailbreak",
      severity: "block",
      pattern:
        /ignore\s+(all\s+)?(previous\s+)?instructions|jailbreak|\bDAN\b|忽略.*(规则|指令|系统)|绕过.*(安全|审核)/i,
      message: "检测到试图绕过安全规则的请求，请专注于方言学习相关问题。",
    },
    {
      id: "harmful",
      severity: "block",
      pattern: /如何\s*(制作|制造).*(炸弹|毒品|武器)|自杀\s*方法/i,
      message: "该话题超出方言学习助手的服务范围。",
    },
  ],
  output: [
    {
      id: "harmful_output",
      severity: "block",
      pattern: /步骤[:：]\s*\d+.*(制作|合成).*(炸弹|毒品|武器)|详细.*自杀\s*方法/i,
      message: "回复内容不符合安全规范，无法展示。",
    },
  ],
};

function ensureDataDirs() {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  fs.mkdirSync(GUARDRAIL_LOG_DIR, { recursive: true });
}

function normalizeText(text) {
  return String(text || "").trim();
}

function redactPii(text) {
  return String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b\d{15,18}\b/g, "[id]");
}

function runRules(text, rules) {
  const violations = [];
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      violations.push({
        id: rule.id,
        severity: rule.severity,
        message: rule.message,
      });
    }
  }
  return violations;
}

function deriveSessionId(req, body = {}) {
  const key =
    body.sessionId ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
    req.socket?.remoteAddress ||
    "anonymous";
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function appendGuardrailLog(entry) {
  ensureDataDirs();
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(GUARDRAIL_LOG_DIR, `${day}.jsonl`);
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function buildBaseResult(stage, raw) {
  return {
    allowed: true,
    stage,
    violations: [],
    sanitizedText: raw,
    message: "",
    judge: AI_ENABLED ? "ai" : "rules",
  };
}

function applyViolations(result, violations, judgeMode) {
  result.violations = [...result.violations, ...violations];
  result.judge = judgeMode;

  const blocking = result.violations.filter((v) => v.severity === "block");
  if (blocking.length) {
    result.allowed = false;
    result.message = blocking[0].message;
    return result;
  }

  const warnings = result.violations.filter((v) => v.severity === "warn");
  if (warnings.length) {
    result.message = warnings[0].message;
  }

  return result;
}

function runHardRules(raw, stage) {
  const rules = stage === "input" ? HARD_INPUT_RULES : HARD_OUTPUT_RULES;
  return runRules(raw, rules);
}

function runFallbackSemanticRules(raw, stage) {
  return runRules(raw, FALLBACK_SEMANTIC_RULES[stage] || []);
}

async function runAiJudge(raw, stage, context) {
  const aiResult = await judgeWithAI(raw, stage, context);
  if (aiResult.skipped) {
    return {
      violations: runFallbackSemanticRules(raw, stage),
      message: "",
      judge: "rules",
    };
  }

  return {
    violations: aiResult.violations || [],
    message: aiResult.message || "",
    allowed: aiResult.allowed,
    judge: "ai",
  };
}

async function checkContent(text, stage, context = {}) {
  const raw = normalizeText(text);
  const result = buildBaseResult(stage, raw);

  if (!raw) {
    result.allowed = false;
    result.message = "内容不能为空。";
    result.judge = "rules";
    return result;
  }

  const maxLen = stage === "input" ? MAX_INPUT_LENGTH : MAX_OUTPUT_LENGTH;
  if (raw.length > maxLen) {
    result.allowed = false;
    result.judge = "rules";
    result.violations.push({
      id: "length",
      severity: "block",
      message: `内容过长（上限 ${maxLen} 字），请缩短后重试。`,
    });
    result.message = result.violations[0].message;
    return result;
  }

  const hardViolations = runHardRules(raw, stage);
  if (hardViolations.length) {
    return applyViolations(result, hardViolations, "rules");
  }

  try {
    const aiJudge = await runAiJudge(raw, stage, context);
    if (aiJudge.allowed === false) {
      result.allowed = false;
      result.message =
        aiJudge.message ||
        (stage === "input"
          ? "该请求未通过 AI 安全审核，请专注于方言学习相关问题。"
          : "回复未通过 AI 安全审核，无法展示。");
    }
    applyViolations(result, aiJudge.violations, aiJudge.judge);
    if (!result.allowed) return result;
    if (aiJudge.message && !result.message) result.message = aiJudge.message;
  } catch (err) {
    console.warn("[GuardrailAI] fallback to rules:", err.message);
    const fallbackViolations = runFallbackSemanticRules(raw, stage);
    applyViolations(result, fallbackViolations, "rules_fallback");
    result.fallbackReason = err.message;
  }

  if (stage === "output") {
    result.sanitizedText = redactPii(raw);
  }

  return result;
}

async function checkInput(text, context = {}) {
  return checkContent(text, "input", context);
}

async function checkOutput(text, context = {}) {
  return checkContent(text, "output", context);
}

function logGuardrailEvent(req, body, checkResult) {
  if (!checkResult.violations.length && checkResult.allowed) return;
  appendGuardrailLog({
    at: Date.now(),
    stage: checkResult.stage,
    sessionId: deriveSessionId(req, body),
    source: body.context?.source || "unknown",
    allowed: checkResult.allowed,
    judge: checkResult.judge || "unknown",
    model: checkResult.judge === "ai" ? GUARDRAIL_MODEL : undefined,
    violations: checkResult.violations.map((v) => v.id),
    preview: redactPii(String(body.text || "")).slice(0, 160),
  });
}

function sanitizeFeedbackText(text, max = 500) {
  return redactPii(String(text || "")).slice(0, max);
}

function submitFeedback(req, body = {}) {
  ensureDataDirs();
  const rating = body.rating === "down" ? "down" : body.rating === "up" ? "up" : "";
  if (!rating) {
    return { ok: false, error: "rating 必须为 up 或 down" };
  }

  const entry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    sessionId: deriveSessionId(req, body),
    rating,
    source: sanitizeFeedbackText(body.source || "chat", 40),
    messageId: sanitizeFeedbackText(body.messageId || "", 64),
    reason: sanitizeFeedbackText(body.reason || "", 120),
    userInput: sanitizeFeedbackText(body.userInput || "", 300),
    assistantReply: sanitizeFeedbackText(body.assistantReply || "", 500),
    guardrailBlocked: Boolean(body.guardrailBlocked),
  };

  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(FEEDBACK_DIR, `${day}.jsonl`);
  const existingLines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean).length
    : 0;
  if (existingLines >= MAX_FEEDBACK_PER_DAY) {
    return { ok: false, error: "今日反馈已达上限，请明日再试" };
  }

  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return { ok: true, id: entry.id };
}

function getGuardrailSummary() {
  ensureDataDirs();
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(GUARDRAIL_LOG_DIR, `${today}.jsonl`);
  const feedbackPath = path.join(FEEDBACK_DIR, `${today}.jsonl`);

  let blocked = 0;
  let warned = 0;
  let feedbackUp = 0;
  let feedbackDown = 0;
  let aiJudged = 0;
  let rulesFallback = 0;

  if (fs.existsSync(logPath)) {
    for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.allowed === false) blocked += 1;
        else if (item.violations?.length) warned += 1;
        if (item.judge === "ai") aiJudged += 1;
        if (item.judge === "rules_fallback") rulesFallback += 1;
      } catch {
        /* skip */
      }
    }
  }

  if (fs.existsSync(feedbackPath)) {
    for (const line of fs.readFileSync(feedbackPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.rating === "up") feedbackUp += 1;
        if (item.rating === "down") feedbackDown += 1;
      } catch {
        /* skip */
      }
    }
  }

  return {
    date: today,
    blocked,
    warned,
    feedbackUp,
    feedbackDown,
    aiJudged,
    rulesFallback,
    aiEnabled: AI_ENABLED,
    model: GUARDRAIL_MODEL,
  };
}

module.exports = {
  checkInput,
  checkOutput,
  logGuardrailEvent,
  submitFeedback,
  getGuardrailSummary,
  redactPii,
};
