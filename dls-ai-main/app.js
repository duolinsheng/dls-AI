const configKey = "dls-ai-config";
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

const localShToZhMap = Object.fromEntries(
  Object.entries(localZhToShMap).map(([zh, sh]) => [sh, zh]),
);

function getConfig() {
  const raw = localStorage.getItem(configKey);
  if (!raw) {
    return {
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
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
  baseUrlEl.value = cfg.baseUrl || "https://api.openai.com/v1";
  modelEl.value = cfg.model || "gpt-4o-mini";
}

async function callChatAPI(messages) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error("未配置 API Key。请先在“模型配置”中保存。");
  }

  const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      messages,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`模型请求失败（${res.status}）：${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型返回为空，请检查接口和模型配置。");
  }
  return content.trim();
}

function localTranslate(input, direction) {
  const dict = direction === "zh_to_sh" ? localZhToShMap : localShToZhMap;
  let out = input;
  const entries = Object.entries(dict).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of entries) {
    out = out.split(k).join(v);
  }
  return out;
}

saveConfigBtn.addEventListener("click", () => {
  const cfg = {
    apiKey: apiKeyEl.value.trim(),
    baseUrl: baseUrlEl.value.trim() || "https://api.openai.com/v1",
    model: modelEl.value.trim() || "gpt-4o-mini",
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
    renderMessage("assistant", `请求失败：${err.message}`);
  }
});

translateBtn.addEventListener("click", async () => {
  const input = translateInputEl.value.trim();
  if (!input) return;
  translateOutputEl.textContent = "翻译中...";
  const direction = directionEl.value;

  const cfg = getConfig();
  if (!cfg.apiKey) {
    const fallback = localTranslate(input, direction);
    translateOutputEl.textContent = `${fallback}\n\n（当前未配置 API Key，已使用本地基础词典兜底翻译）`;
    return;
  }

  const systemPrompt =
    direction === "zh_to_sh"
      ? "你是上海话翻译助手。请把用户输入的中文翻译成自然的上海话，保持简洁；必要时保留原词并给出括号解释。只输出翻译结果。"
      : "你是上海话翻译助手。请把用户输入的上海话翻译成标准中文，表达自然。只输出翻译结果。";

  try {
    const result = await callChatAPI([
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ]);
    translateOutputEl.textContent = result;
  } catch (err) {
    const fallback = localTranslate(input, direction);
    translateOutputEl.textContent = `${fallback}\n\n（模型翻译失败：${err.message}；已回退到本地基础词典）`;
  }
});

loadConfigToForm();
