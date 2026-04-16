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

// 页面导航功能
function navigateTo(pageName) {
  // 隐藏所有页面
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => page.classList.remove('active'));
  
  // 显示目标页面
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // 更新导航按钮状态
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.page === pageName) {
      btn.classList.add('active');
    }
  });
  
  // 保存当前页面到 localStorage
  localStorage.setItem('dls-ai-current-page', pageName);
}

// 初始化导航
function initNavigation() {
  // 为所有导航按钮添加点击事件
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const pageName = btn.dataset.page;
      navigateTo(pageName);
    });
  });
  
  // 恢复上次访问的页面
  const lastPage = localStorage.getItem('dls-ai-current-page') || 'home';
  navigateTo(lastPage);
}

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
let yueDictionaryLoadPromise = null;
const yueAudioAvailabilityCache = new Map();
const yueAudioResolveCache = new Map();

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

function loadYueDictionary() {
  if (yueDictionaryLoaded) return Promise.resolve();
  if (yueDictionaryLoadPromise) return yueDictionaryLoadPromise;

  yueDictionaryLoadPromise = fetch("read/yyzd.csv")
    .then((response) => response.text())
    .then((csvText) => {
      const lines = csvText.split(/\r?\n/);
      yueDictionary = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = parseCsvLine(line);
        if (parts.length >= 3) {
          const simp = parts[0] || "";
          const trad = parts[1] || "";
          const pinyin = parts[2] || "";
          const example = parts[3] || "";
          const explanation = parts[4] || "";
          const alt = parts[5] || "";

          yueDictionary.push({
            simp,
            trad,
            pinyin,
            example,
            explanation,
            alt,
          });
        }
      }

      yueDictionaryLoaded = true;
      console.log(`粤语词典加载完成，共 ${yueDictionary.length} 条记录`);
    })
    .catch((err) => {
      yueDictionaryLoadPromise = null;
      yueDictionaryLoaded = false;
      console.error("加载粤语词典失败:", err);
      throw err;
    });

  return yueDictionaryLoadPromise;
}

function findYueWords(word) {
  if (!yueDictionaryLoaded) return [];
  return yueDictionary.filter((item) => item.simp === word || item.trad === word);
}

function getPrimaryPinyin(pinyin) {
  if (!pinyin || !pinyin.trim()) return "";
  return pinyin.toLowerCase().trim().split("/")[0].trim();
}

function withToneFallbacks(pinyin) {
  const out = [pinyin];
  const match = pinyin.match(/^(.*?)([1-9])$/);
  if (!match) return out;
  const stem = match[1];
  const tone = match[2];
  if (tone === "7" || tone === "8" || tone === "9") {
    out.push(`${stem}1`, `${stem}3`, `${stem}6`);
  }
  return out;
}

function withSpellingFallbacks(pinyin) {
  const out = [pinyin];
  const queue = [pinyin];
  const seen = new Set([pinyin]);
  const rules = [
    (value) => value.replace(/^(.*)eui([1-9])$/, "$1eoi$2"),
    (value) => value.replace(/^(.*)eun([1-9])$/, "$1eon$2"),
    (value) => value.replace(/^(.*)eung([1-9])$/, "$1oeng$2"),
    (value) => value.replace(/^(.*)euk([1-9])$/, "$1oek$2"),
    (value) => value.replace(/^(.*)eut([1-9])$/, "$1eot$2"),
    (value) =>
      value.replace(
        /^((?:gw|kw|ng|ch|zh|sh|[bcdfghjklmnpqrstvwxyz]))a([1-9])$/,
        "$1aa$2",
      ),
    (value) => value.replace(/^hng([1-9])$/, "ng$1"),
    (value) => value.replace(/^yu([1-9])$/, "jyu$1"),
    (value) => value.replace(/^yun([1-9])$/, "jyun$1"),
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const applyRule of rules) {
      const next = applyRule(current);
      if (next !== current && !seen.has(next)) {
        seen.add(next);
        out.push(next);
        queue.push(next);
      }
    }
  }

  return out;
}

function withInitialFallbacks(pinyin) {
  const out = [pinyin];
  if (pinyin.startsWith("ch")) out.push(`c${pinyin.slice(2)}`);
  if (pinyin.startsWith("zh")) out.push(`z${pinyin.slice(2)}`);
  if (pinyin.startsWith("sh")) out.push(`s${pinyin.slice(2)}`);
  if (pinyin.startsWith("y")) out.push(`j${pinyin.slice(1)}`);
  if (pinyin.startsWith("j")) out.push(`z${pinyin.slice(1)}`);
  return out;
}

function getYuePinyinCandidates(pinyin) {
  const pinyinMain = getPrimaryPinyin(pinyin);
  if (!pinyinMain) return [];

  const pinyinMap = {
    yu5: "jyu5",
    yu6: "jyu6",
    seui3: "seoi3",
    seoi6: "seoi6",
    jeung1: "jung1",
    jeung3: "jung3",
    jeong1: "jung1",
    jeong3: "jung3",
    jaang1: "zoeng1",
    jaang2: "zoeng2",
    jaang3: "zoeng3",
    jaang6: "zoeng6",
    gaang1: "gong1",
    gaang2: "gong2",
    gaang3: "gong3",
    gaang6: "gong6",
    maang5: "maang5",
    maang6: "maang6",
    paang4: "pang4",
    paang6: "pang6",
    faang1: "fong1",
    faang2: "fong2",
    faang3: "fong3",
    faang6: "fong6",
    naang5: "nong5",
    naang6: "nong6",
    laang6: "long6",
    laang5: "long5",
    yaang1: "jong1",
    yaang2: "jung2",
    yaang3: "jung3",
    yaang6: "jung6",
    yung1: "jung1",
    yung2: "jung2",
    yung3: "jung3",
    yung6: "jung6",
    waang1: "wong1",
    waang2: "wong2",
    waang3: "wong3",
    waang6: "wong6",
    yu1: "jyu1",
    yu2: "jyu2",
    yu3: "jyu3",
    yu4: "jyu4",
    yun1: "jyun1",
    yun2: "jyun2",
    yun3: "jyun3",
    yun4: "jyun4",
    yun5: "jyun5",
    yun6: "jyun6",
  };

  const seeds = [pinyinMain];
  const mapped = pinyinMap[pinyinMain];
  if (mapped) seeds.push(mapped);

  const candidates = [];
  for (const seed of seeds) {
    for (const toneVariant of withToneFallbacks(seed)) {
      for (const spellingVariant of withSpellingFallbacks(toneVariant)) {
        for (const initialVariant of withInitialFallbacks(spellingVariant)) {
          if (!candidates.includes(initialVariant)) {
            candidates.push(initialVariant);
          }
        }
      }
    }
  }

  return candidates;
}

function getYuePinyinUrl(pinyin) {
  const candidates = getYuePinyinCandidates(pinyin);
  if (candidates.length === 0) return null;
  return `read/jyutping_female/${candidates[0]}.mp3`;
}

async function checkAudioPathExists(path) {
  if (yueAudioAvailabilityCache.has(path)) {
    return yueAudioAvailabilityCache.get(path);
  }
  let ok = false;
  try {
    const response = await fetch(path, { method: "HEAD" });
    ok = response.ok;
  } catch {
    ok = false;
  }
  yueAudioAvailabilityCache.set(path, ok);
  return ok;
}

async function resolveYueAudioPath(pinyin) {
  const pinyinMain = getPrimaryPinyin(pinyin);
  if (!pinyinMain) return null;
  if (yueAudioResolveCache.has(pinyinMain)) {
    return yueAudioResolveCache.get(pinyinMain);
  }

  const candidates = getYuePinyinCandidates(pinyin);
  for (const candidate of candidates) {
    const path = `read/jyutping_female/${candidate}.mp3`;
    const exists = await checkAudioPathExists(path);
    if (exists) {
      yueAudioResolveCache.set(pinyinMain, path);
      return path;
    }
  }

  yueAudioResolveCache.set(pinyinMain, null);
  return null;
}

async function checkYueAudioExists(pinyin) {
  const audioPath = await resolveYueAudioPath(pinyin);
  return Boolean(audioPath);
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

function copyText(text) {
  if (!text) return;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("文本已复制到剪贴板");
    }).catch(err => {
      console.error("复制失败:", err);
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand("copy");
    if (successful) {
      console.log("文本已复制到剪贴板（使用 execCommand）");
    } else {
      alert("复制失败，请手动复制");
    }
  } catch (err) {
    console.error("复制失败:", err);
    alert("复制失败，请手动复制");
  }
  
  document.body.removeChild(textArea);
}

async function playYuePinyin(pinyin, resolvedPath = "") {
  if (!pinyin) return;

  const mp3Path = resolvedPath || (await resolveYueAudioPath(pinyin));
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
  
  results.forEach((item) => {
    const el = document.createElement("div");
    el.className = "yue-dict-item";

    el.innerHTML = `
      <h4>${item.simp} <span style="font-size:0.85em;color:var(--muted)">(${item.trad})</span></h4>
      <p class="pinyin">拼音：${item.pinyin}</p>
      ${item.example ? `<p class="example">示例：${item.example}</p>` : ""}
      ${item.explanation ? `<p class="explanation">解释：${item.explanation}</p>` : ""}
      <div class="audio-action"><span style="color:var(--muted);font-size:0.85em">（检测发音中...）</span></div>
    `;
    yueDictResultEl.appendChild(el);

    const audioActionEl = el.querySelector(".audio-action");
    resolveYueAudioPath(item.pinyin).then((audioPath) => {
      if (!audioActionEl) return;
      audioActionEl.innerHTML = "";
      if (!audioPath) {
        audioActionEl.innerHTML = `<span style="color:var(--muted);font-size:0.85em">（无发音文件）</span>`;
        return;
      }
      const playBtn = document.createElement("button");
      playBtn.className = "play-btn";
      playBtn.textContent = "🔊 播放发音";
      playBtn.addEventListener("click", () => {
        playYuePinyin(item.pinyin, audioPath);
      });
      audioActionEl.appendChild(playBtn);
    });
  });
}

async function searchYueWord() {
  const word = yueDictSearchEl.value.trim();
  if (!word) {
    alert("请输入要查询的词汇");
    return;
  }

  try {
    await loadYueDictionary();
  } catch {
    alert("粤语词典加载失败，请稍后重试");
    return;
  }

  const results = findYueWords(word);

  if (results.length > 0) {
    renderYueDictResult(results);
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

// 初始化页面导航
initNavigation();

loadConfigToForm();
renderFavorites();
renderTranslateHistory();
loadYueDictionary().catch(() => {
  // 首次预加载失败时，保留在查询时重试。
});
