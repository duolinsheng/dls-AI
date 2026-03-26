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
      baseUrl: "http://localhost:11434",
      model: "qwen3.5:4b",
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      apiKey: "",
      baseUrl: "http://localhost:11434",
      model: "qwen3.5:4b",
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
  baseUrlEl.value = cfg.baseUrl || "http://localhost:11434";
  modelEl.value = cfg.model || "qwen3.5:4b";
}

async function callChatAPI(messages) {
  const cfg = getConfig();
  const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
  const url = `${baseUrl}/api/chat`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model || "qwen3.5:4b",
      messages,
      stream: false,
      options: {
        temperature: 0.3,
      },
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`模型请求失败（${res.status}）：${rawText}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const preview = rawText.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `接口返回的不是 JSON。请检查 Ollama 服务地址与模型配置。响应片段：${preview}`,
    );
  }

  const content = data?.message?.content || data?.choices?.[0]?.message?.content;
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
    baseUrl: baseUrlEl.value.trim() || "http://localhost:11434",
    model: modelEl.value.trim() || "qwen3.5:4b",
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

  const systemPrompt = getTranslatePrompt(direction);

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
