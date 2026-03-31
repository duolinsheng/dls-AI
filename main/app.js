const configKey = "dls-ai-config";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3.5:4b";
const REQUEST_TIMEOUT_MS = 30000;
const chatHistoryEl = document.getElementById("chatHistory");

const apiKeyEl = document.getElementById("apiKey");
const baseUrlEl = document.getElementById("baseUrl");
const modelEl = document.getElementById("model");
const saveConfigBtn = document.getElementById("saveConfig");

const chatInputEl = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChat");

const directionEl = document.getElementById("direction");
const translateInputEl = document.getElementById("translateInput");
const translateBtn = document.getElementById("translateBtn");
const translateOutputEl = document.getElementById("translateOutput");

const conversation = [
  {
    role: "system",
    content:
      "你是一个耐心的方言学习助手。回答简洁、准确、友好。若涉及上海话，请尽量提供中文解释。",
  },
];

const localZhToShMap = {
  你好: "侬好",
  谢谢: "霞霞侬",
  我: "阿拉",
  你: "侬",
  我们: "阿拉",
  今天: "今朝",
  明天: "明朝",
  这个: "格个",
  那个: "阿个",
  什么: "啥个",
  很好: "老好额",
};

const localZhToYueMap = {
  你好: "你好",
  谢谢: "多谢",
  我: "我",
  你: "你",
  我们: "我哋",
  今天: "今日",
  明天: "听日",
  这个: "呢个",
  那个: "嗰个",
  什么: "咩",
  很好: "几好",
};

const localShToZhMap = Object.fromEntries(
  Object.entries(localZhToShMap).map(([zh, sh]) => [sh, zh]),
);
const localYueToZhMap = Object.fromEntries(
  Object.entries(localZhToYueMap).map(([zh, yue]) => [yue, zh]),
);

function getConfig() {
  const raw = localStorage.getItem(configKey);
  if (!raw) {
    return {
      apiKey: "",
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      apiKey: parsed.apiKey || "",
      baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
      model: parsed.model || DEFAULT_MODEL,
    };
  } catch {
    return {
      apiKey: "",
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
    };
  }
}

function setConfig(config) {
  localStorage.setItem(configKey, JSON.stringify(config));
}

function renderMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = `${role === "user" ? "你" : "助手"}：${text}`;
  chatHistoryEl.appendChild(el);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

function loadConfigToForm() {
  const cfg = getConfig();
  apiKeyEl.value = cfg.apiKey || "";
  baseUrlEl.value = cfg.baseUrl || DEFAULT_BASE_URL;
  modelEl.value = cfg.model || DEFAULT_MODEL;
}

function isLikelyOpenAIEndpoint(baseUrl) {
  return /\/v1$/i.test(baseUrl) || /api\.openai\.com$/i.test(baseUrl);
}

function buildRequestUrl(baseUrl) {
  if (/api\.openai\.com$/i.test(baseUrl)) {
    return `${baseUrl}/v1/chat/completions`;
  }
  if (/\/v1$/i.test(baseUrl)) {
    return `${baseUrl}/chat/completions`;
  }
  return `${baseUrl}/api/chat`;
}

function getErrorMessage(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function extractContentFromResponse(data) {
  if (data && data.message && typeof data.message.content === "string") {
    return data.message.content.trim();
  }
  if (
    data &&
    Array.isArray(data.choices) &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
  ) {
    return data.choices[0].message.content.trim();
  }
  return "";
}

async function callChatAPI(messages) {
  const cfg = getConfig();
  const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Base URL 不能为空，请填写 http://localhost:11434");
  }
  if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)) {
    throw new Error(
      "检测到本地地址使用了 https。Ollama 默认是 http，请改为 http://localhost:11434",
    );
  }

  const useOpenAIStyle = isLikelyOpenAIEndpoint(baseUrl);
  const url = buildRequestUrl(baseUrl);
  const headers = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }

  let res;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model || DEFAULT_MODEL,
        messages,
        stream: false,
        ...(useOpenAIStyle
          ? { temperature: 0.3 }
          : {
              options: {
                temperature: 0.3,
              },
            }),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === "AbortError"
        ? `请求超时（>${REQUEST_TIMEOUT_MS / 1000} 秒）`
        : getErrorMessage(error);
    throw new Error(
      `无法连接到模型服务（${reason}）。请确认：1) Base URL 配置正确；2) 本地 Ollama 服务已启动（若你在用 Ollama）；3) 若页面来自 GitHub Pages（https），浏览器会拦截对本地 http 的访问。`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await res.text();

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!res.ok) {
    const apiError =
      (data && data.error && (data.error.message || data.error.code)) ||
      rawText.slice(0, 200);
    throw new Error(`模型请求失败（${res.status}）：${apiError}`);
  }

  if (!data) {
    const preview = rawText.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `接口返回的不是 JSON。请检查 Ollama 服务地址与模型配置。响应片段：${preview}`,
    );
  }

  const content = extractContentFromResponse(data);
  if (!content) {
    throw new Error("模型返回为空，请检查 Ollama 接口和模型配置。");
  }
  return content.trim();
}

function localTranslate(input, direction) {
  function applyDict(text, dict) {
    let out = text;
    const entries = Object.entries(dict).sort((a, b) => b[0].length - a[0].length);
    for (const [k, v] of entries) {
      out = out.split(k).join(v);
    }
    return out;
  }

  if (direction === "zh_to_sh") return applyDict(input, localZhToShMap);
  if (direction === "sh_to_zh") return applyDict(input, localShToZhMap);
  if (direction === "zh_to_yue") return applyDict(input, localZhToYueMap);
  if (direction === "yue_to_zh") return applyDict(input, localYueToZhMap);
  if (direction === "sh_to_yue") {
    const zh = applyDict(input, localShToZhMap);
    return applyDict(zh, localZhToYueMap);
  }
  if (direction === "yue_to_sh") {
    const zh = applyDict(input, localYueToZhMap);
    return applyDict(zh, localZhToShMap);
  }
  return input;
}

function getTranslatePrompt(direction) {
  const promptMap = {
    zh_to_sh:
      "你是翻译助手。请把用户输入的中文翻译成自然的上海话，表达简洁，必要时保留原词并用括号补充解释。只输出翻译结果。",
    sh_to_zh:
      "你是翻译助手。请把用户输入的上海话翻译成标准中文，表达自然。只输出翻译结果。",
    zh_to_yue:
      "你是翻译助手。请把用户输入的中文翻译成自然粤语。可使用常见粤语字词，表达地道。只输出翻译结果。",
    yue_to_zh:
      "你是翻译助手。请把用户输入的粤语翻译成标准中文，表达自然。只输出翻译结果。",
    sh_to_yue:
      "你是翻译助手。请把用户输入的上海话翻译成自然粤语，语义准确、表达地道。只输出翻译结果。",
    yue_to_sh:
      "你是翻译助手。请把用户输入的粤语翻译成自然上海话，语义准确、表达地道。只输出翻译结果。",
  };
  return (
    promptMap[direction] ||
    "你是翻译助手。请将用户输入翻译成目标语言，保持原意、表达自然。只输出翻译结果。"
  );
}

saveConfigBtn.addEventListener("click", () => {
  const cfg = {
    apiKey: apiKeyEl.value.trim(),
    baseUrl: baseUrlEl.value.trim() || DEFAULT_BASE_URL,
    model: modelEl.value.trim() || DEFAULT_MODEL,
  };
  setConfig(cfg);
  alert("配置已保存");
});

sendChatBtn.addEventListener("click", async () => {
  const input = chatInputEl.value.trim();
  if (!input) return;
  renderMessage("user", input);
  chatInputEl.value = "";

  conversation.push({ role: "user", content: input });
  try {
    const reply = await callChatAPI(conversation);
    conversation.push({ role: "assistant", content: reply });
    renderMessage("assistant", reply);
  } catch (err) {
    renderMessage("assistant", `请求失败：${getErrorMessage(err)}`);
  }
});

translateBtn.addEventListener("click", async () => {
  const input = translateInputEl.value.trim();
  if (!input) return;
  translateOutputEl.textContent = "翻译中...";
  const direction = directionEl.value;

  const systemPrompt = getTranslatePrompt(direction);

  try {
    const result = await callChatAPI([
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ]);
    translateOutputEl.textContent = result;
  } catch (err) {
    const fallback = localTranslate(input, direction);
    translateOutputEl.textContent = `${fallback}\n\n（模型翻译失败：${getErrorMessage(err)}；已回退到本地基础词典）`;
  }
});

loadConfigToForm();
