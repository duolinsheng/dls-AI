const configKey = "dls-ai-config";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:0.5b";
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
const clearTranslateBtn = document.getElementById("clearTranslateBtn");
const speakOutputBtn = document.getElementById("speakOutputBtn");
const copyOutputBtn = document.getElementById("copyOutputBtn");
const favoriteOutputBtn = document.getElementById("favoriteOutputBtn");

const favoritesListEl = document.getElementById("favoritesList");
const noFavoritesEl = document.getElementById("noFavorites");
const clearFavoritesBtn = document.getElementById("clearFavoritesBtn");

const translateHistoryListEl = document.getElementById("translateHistoryList");
const noTranslateHistoryEl = document.getElementById("noTranslateHistory");
const clearChatHistoryBtn = document.getElementById("clearChatHistoryBtn");
const clearTranslateHistoryBtn = document.getElementById("clearTranslateHistoryBtn");
const yueDictSearchEl = document.getElementById("yueDictSearch");
const yueDictSearchBtn = document.getElementById("yueDictSearchBtn");
const yueDictResultEl = document.getElementById("yueDictResult");
const noYueDictResultEl = document.getElementById("noYueDictResult");

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

let yueDictionary = [];
let yueDictionaryLoaded = false;

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

function getTranslateDirectionName(direction) {
  const directionMap = {
    zh_to_sh: "中文 → 上海话",
    sh_to_zh: "上海话 → 中文",
    zh_to_yue: "中文 → 粤语",
    yue_to_zh: "粤语 → 中文",
    sh_to_yue: "上海话 → 粤语",
    yue_to_sh: "粤语 → 上海话",
  };
  return directionMap[direction] || direction;
}

function loadYueDictionary() {
  if (yueDictionaryLoaded) return;
  
  fetch("read/yyzd.csv")
    .then(response => response.text())
    .then(csvText => {
      const lines = csvText.split("\n");
      yueDictionary = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(",");
        if (parts.length >= 3) {
          const simp = parts[0];
          const trad = parts[1];
          const pinyin = parts[2];
          const example = parts[3] || "";
          const explanation = parts[4] || "";
          
          yueDictionary.push({
            simp,
            trad,
            pinyin,
            example,
            explanation,
          });
        }
      }
      
      yueDictionaryLoaded = true;
      console.log(`粤语词典加载完成，共 ${yueDictionary.length} 条记录`);
    })
    .catch(err => {
      console.error("加载粤语词典失败:", err);
    });
}

function findYueWord(word) {
  if (!yueDictionaryLoaded) return null;
  
  const result = yueDictionary.find(item => 
    item.simp === word || item.trad === word
  );
  
  return result || null;
}

function getYuePinyinUrl(pinyin) {
  if (!pinyin || !pinyin.trim()) return null;
  
  const pinyinLower = pinyin.toLowerCase().trim();
  const pinyinMain = pinyinLower.split("/")[0].trim();
  
  const pinyinMap = {
    'yu5': 'jyu5',
    'yu6': 'jyu6',
    'seui3': 'seoi3',
    'seoi6': 'seoi6',
    'jeung1': 'jung1',
    'jeung3': 'jung3',
    'jeong1': 'jung1',
    'jeong3': 'jung3',
    'jaang1': 'zoeng1',
    'jaang2': 'zoeng2',
    'jaang3': 'zoeng3',
    'jaang6': 'zoeng6',
    'gaang1': 'gong1',
    'gaang2': 'gong2',
    'gaang3': 'gong3',
    'gaang6': 'gong6',
    'maang5': 'maang5',
    'maang6': 'maang6',
    'paang4': 'pang4',
    'paang6': 'pang6',
    'faang1': 'fong1',
    'faang2': 'fong2',
    'faang3': 'fong3',
    'faang6': 'fong6',
    'naang5': 'nong5',
    'naang6': 'nong6',
    'laang6': 'long6',
    'laang5': 'long5',
    'yaang1': 'jong1',
    'yaang2': 'jung2',
    'yaang3': 'jung3',
    'yaang6': 'jung6',
    'yung1': 'jung1',
    'yung2': 'jung2',
    'yung3': 'jung3',
    'yung6': 'jung6',
    'waang1': 'wong1',
    'waang2': 'wong2',
    'waang3': 'wong3',
    'waang6': 'wong6',
    'aa1': 'aa1',
    'aa2': 'aa2',
    'aa3': 'aa3',
    'aa4': 'aa4',
    'aa5': 'aa5',
    'aa6': 'aa6',
  };
  
  const mappedPinyin = pinyinMap[pinyinMain] || pinyinMain;
  const mp3Path = `read/jyutping_female/${mappedPinyin}.mp3`;
  return mp3Path;
}

function checkYueAudioExists(pinyin) {
  const mp3Path = getYuePinyinUrl(pinyin);
  if (!mp3Path) return false;
  
  return new Promise((resolve) => {
    const audio = new Audio(mp3Path);
    audio.preload = "none";
    audio.onerror = () => resolve(false);
    audio.oncanplaythrough = () => resolve(true);
    audio.onloadeddata = () => resolve(true);
    
    const timer = setTimeout(() => {
      resolve(false);
    }, 500);
    
    audio.load();
  });
}

function loadFavorites() {
  const raw = localStorage.getItem("dls-ai-favorites");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveFavorites(favorites) {
  localStorage.setItem("dls-ai-favorites", JSON.stringify(favorites));
}

function renderFavorites() {
  const favorites = loadFavorites();
  favoritesListEl.innerHTML = "";
  
  if (favorites.length === 0) {
    noFavoritesEl.style.display = "block";
    return;
  }
  
  noFavoritesEl.style.display = "none";
  
  favorites.forEach((item, index) => {
    const el = document.createElement("div");
    el.className = "favorites-item";
    el.innerHTML = `
      <div class="favorites-item-content">
        <strong>${getTranslateDirectionName(item.direction)}</strong>
        <p style="margin: 4px 0;">${item.input}</p>
        <p style="margin: 4px 0; color: var(--accent); font-weight: 500;">${item.output}</p>
      </div>
      <div class="favorites-item-actions">
        <button class="icon-btn" title="朗读" onclick="speakText('${item.output.replace(/'/g, "\\'")}')">🔊</button>
        <button class="icon-btn" title="复制" onclick="copyText('${item.output.replace(/'/g, "\\'")}')">📋</button>
        <button class="icon-btn" title="删除" style="color: var(--delete);" onclick="deleteFavorite(${index})">🗑️</button>
      </div>
    `;
    favoritesListEl.appendChild(el);
  });
}

function deleteFavorite(index) {
  const favorites = loadFavorites();
  favorites.splice(index, 1);
  saveFavorites(favorites);
  renderFavorites();
}

function addToFavorites(input, output, direction) {
  const favorites = loadFavorites();
  favorites.unshift({ input, output, direction, timestamp: Date.now() });
  if (favorites.length > 50) {
    favorites.pop();
  }
  saveFavorites(favorites);
  renderFavorites();
}

function loadTranslateHistory() {
  const raw = localStorage.getItem("dls-ai-translate-history");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTranslateHistory(history) {
  localStorage.setItem("dls-ai-translate-history", JSON.stringify(history));
}

function renderTranslateHistory() {
  const history = loadTranslateHistory();
  translateHistoryListEl.innerHTML = "";
  
  if (history.length === 0) {
    noTranslateHistoryEl.style.display = "block";
    return;
  }
  
  noTranslateHistoryEl.style.display = "none";
  
  history.slice(0, 20).forEach((item, index) => {
    const el = document.createElement("div");
    el.className = "history-item";
    el.innerHTML = `
      <div class="history-item-content">
        <strong>${getTranslateDirectionName(item.direction)}</strong>
        <p style="margin: 4px 0;">${item.input}</p>
        <p style="margin: 4px 0; color: var(--accent); font-weight: 500;">${item.output}</p>
      </div>
      <div class="history-item-actions">
        <button class="icon-btn" title="朗读" onclick="speakText('${item.output.replace(/'/g, "\\'")}')">🔊</button>
        <button class="icon-btn" title="复制" onclick="copyText('${item.output.replace(/'/g, "\\'")}')">📋</button>
        <button class="icon-btn" title="收藏" onclick="addToFavorites('${item.input.replace(/'/g, "\\'")}', '${item.output.replace(/'/g, "\\'")}', '${item.direction}')">⭐</button>
      </div>
    `;
    translateHistoryListEl.appendChild(el);
  });
}

function addToTranslateHistory(input, output, direction) {
  const history = loadTranslateHistory();
  history.unshift({ input, output, direction, timestamp: Date.now() });
  if (history.length > 100) {
    history.pop();
  }
  saveTranslateHistory(history);
  renderTranslateHistory();
}

function speakText(text) {
  if (!text) return;
  
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else {
    alert("您的浏览器不支持语音朗读功能");
  }
}

function playYuePinyin(pinyin) {
  if (!pinyin) return;
  
  const mp3Path = getYuePinyinUrl(pinyin);
  if (!mp3Path) {
    console.warn(`发音路径无效: ${pinyin}`);
    alert("发音文件不存在或无法播放");
    return;
  }
  
  console.log(`尝试播放发音: ${mp3Path}`);
  
  const audio = new Audio(mp3Path);
  
  audio.play().then(() => {
    console.log(`成功播放发音: ${mp3Path}`);
  }).catch(err => {
    console.error("播放发音失败:", err);
    alert("发音文件不存在或无法播放");
  });
}

function renderYueDictResult(results) {
  if (!results || results.length === 0) {
    yueDictResultEl.innerHTML = "";
    noYueDictResultEl.style.display = "block";
    return;
  }
  
  noYueDictResultEl.style.display = "none";
  yueDictResultEl.innerHTML = "";
  
  results.forEach(item => {
    const el = document.createElement("div");
    el.className = "yue-dict-item";
    
    const pinyinUrl = getYuePinyinUrl(item.pinyin);
    const hasAudio = pinyinUrl && item.pinyin && item.pinyin.trim();
    
    el.innerHTML = `
      <h4>${item.simp} <span style="font-size:0.85em;color:var(--muted)">(${item.trad})</span></h4>
      <p class="pinyin">拼音：${item.pinyin}</p>
      ${item.example ? `<p class="example">示例：${item.example}</p>` : ""}
      ${item.explanation ? `<p class="explanation">解释：${item.explanation}</p>` : ""}
      ${hasAudio ? `<button class="play-btn" onclick="playYuePinyin('${item.pinyin.replace(/'/g, "\\'")}')">🔊 播放发音</button>` : `<span style="color:var(--muted);font-size:0.85em">（无发音文件）</span>`}
    `;
    
    yueDictResultEl.appendChild(el);
  });
}

function searchYueWord() {
  const word = yueDictSearchEl.value.trim();
  if (!word) {
    alert("请输入要查询的词汇");
    return;
  }
  
  const result = findYueWord(word);
  
  if (result) {
    renderYueDictResult([result]);
  } else {
    renderYueDictResult([]);
    alert(`未找到词汇 "${word}" 的相关信息`);
  }
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
    addToTranslateHistory(input, result, direction);
  } catch (err) {
    const fallback = localTranslate(input, direction);
    translateOutputEl.textContent = `${fallback}\n\n（模型翻译失败：${getErrorMessage(err)}；已回退到本地基础词典）`;
    addToTranslateHistory(input, fallback, direction);
  }
});

clearTranslateBtn.addEventListener("click", () => {
  translateInputEl.value = "";
  translateOutputEl.textContent = "";
});

speakOutputBtn.addEventListener("click", () => {
  const text = translateOutputEl.textContent.trim();
  speakText(text);
});

copyOutputBtn.addEventListener("click", () => {
  const text = translateOutputEl.textContent.trim();
  copyText(text);
});

favoriteOutputBtn.addEventListener("click", () => {
  const input = translateInputEl.value.trim();
  const output = translateOutputEl.textContent.trim();
  const direction = directionEl.value;
  
  if (!input || !output) {
    alert("请先翻译内容");
    return;
  }
  
  addToFavorites(input, output, direction);
  alert("已添加到收藏夹");
});

clearFavoritesBtn.addEventListener("click", () => {
  if (confirm("确定要清空所有收藏吗？")) {
    localStorage.removeItem("dls-ai-favorites");
    renderFavorites();
  }
});

clearChatHistoryBtn.addEventListener("click", () => {
  if (confirm("确定要清空对话历史吗？")) {
    localStorage.removeItem("dls-ai-chat-history");
    chatHistoryEl.innerHTML = "";
    conversation.length = 1;
    conversation[0] = {
      role: "system",
      content:
        "你是一个耐心的方言学习助手。回答简洁、准确、友好。若涉及上海话，请尽量提供中文解释。",
    };
  }
});

clearTranslateHistoryBtn.addEventListener("click", () => {
  if (confirm("确定要清空翻译历史吗？")) {
    localStorage.removeItem("dls-ai-translate-history");
    renderTranslateHistory();
  }
});

yueDictSearchBtn.addEventListener("click", searchYueWord);

yueDictSearchEl.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    searchYueWord();
  }
});

loadConfigToForm();
renderFavorites();
renderTranslateHistory();
loadYueDictionary();
