const configKey = "dls-ai-config";
const DEFAULT_BASE_URL = "/api";
const DEFAULT_MODEL = "qwen3.5:0.8b";
const REQUEST_TIMEOUT_MS = 120000;
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
      "你是一个耐心的粤语学习助手。回答简洁、准确、友好。若涉及粤语，请尽量提供中文解释和粤语发音。",
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
    let baseUrl = parsed.baseUrl || DEFAULT_BASE_URL;
    if (baseUrl.includes("localhost")) {
      baseUrl = baseUrl.replace("localhost", "127.0.0.1");
    }
    return {
      apiKey: parsed.apiKey || "",
      baseUrl: baseUrl,
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
  if (baseUrl === "/api") {
    return "/api/chat";
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
        keep_alive: -1,
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

  if (direction === "zh_to_yue") return applyDict(input, localZhToYueMap);
  if (direction === "yue_to_zh") return applyDict(input, localYueToZhMap);
  return input;
}

function getTranslatePrompt(direction) {
  const promptMap = {
    zh_to_yue:
      "你是翻译助手。请把用户输入的中文翻译成自然粤语。可使用常见粤语字词，表达地道。只输出翻译结果。",
    yue_to_zh:
      "你是翻译助手。请把用户输入的粤语翻译成标准中文，表达自然。只输出翻译结果。",
  };
  return (
    promptMap[direction] ||
    "你是翻译助手。请将用户输入翻译成目标语言，保持原意、表达自然。只输出翻译结果。"
  );
}

function getTranslateDirectionName(direction) {
  const directionMap = {
    zh_to_yue: "中文 → 粤语",
    yue_to_zh: "粤语 → 中文",
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
  const cleaned = pinyin.toLowerCase().trim().split("/")[0].trim();
  const firstPart = cleaned.split(/\s+/)[0].trim();
  return firstPart;
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

  const dictContext = extractYueDictContext(input);
  const lastMessage = conversation.length > 1 ? conversation[conversation.length - 1] : null;
  const enhancedInput = dictContext ? `${input}\n\n[粤语词典参考信息]\n${dictContext}` : input;
  
  conversation.push({ role: "user", content: enhancedInput });
  try {
    const reply = await callChatAPI(conversation);
    conversation.push({ role: "assistant", content: reply });
    renderMessage("assistant", reply);
  } catch (err) {
    renderMessage("assistant", `请求失败：${getErrorMessage(err)}`);
  }
});

function extractYueDictContext(text) {
  if (!yueDictionary || yueDictionary.length === 0) return "";
  
  const yueKeywords = ["粤语", "广东话", "粤", "点解", "咩", "嘅", "喺", "佢", "唔", "啲", "嘢", "噉", "喇", "嚟", "係"];
  const hasYueKeyword = yueKeywords.some(keyword => text.includes(keyword));
  
  if (!hasYueKeyword) return "";
  
  const singleChars = text.replace(/[^\u4e00-\u9fff]/g, "").split("").filter(c => c.trim());
  const matchedEntries = [];
  
  for (const char of singleChars) {
    const found = yueDictionary.filter(entry => entry.character === char);
    if (found.length > 0) {
      matchedEntries.push(...found.slice(0, 2));
    }
  }
  
  if (matchedEntries.length === 0) return "";
  
  const uniqueEntries = matchedEntries.slice(0, 10);
  return uniqueEntries.map(entry => {
    const example = entry.example ? `（示例：${entry.example}）` : "";
    const explanation = entry.explanation ? ` - ${entry.explanation}` : "";
    return `${entry.character} (${entry.pinyin})${example}${explanation}`;
  }).join("\n");
}

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
        "你是一个耐心的粤语学习助手。回答简洁、准确、友好。若涉及粤语，请尽量提供中文解释和粤语发音。",
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

const dailyQuotes = [
  { yue: "早晨！", zh: "早上好！", pinyin: "zou2 san4" },
  { yue: "你好吗？", zh: "你好吗？", pinyin: "nei5 hou2 maa3" },
  { yue: "多谢你！", zh: "谢谢你！", pinyin: "do1 ze6 nei5" },
  { yue: "唔该晒！", zh: "非常感谢！", pinyin: "m4 goi1 saai3" },
  { yue: "食咗饭未呀？", zh: "吃饭了吗？", pinyin: "sik6 zo2 faan6 mei6 aa3" },
  { yue: "今日天气真好！", zh: "今天天气真好！", pinyin: "gam1 jat6 tin1 hei3 zan1 hou2" },
  { yue: "我好挂住你！", zh: "我很想念你！", pinyin: "ngo5 hou2 gwaa3 zyu6 nei5" },
  { yue: "慢慢行！", zh: "慢慢走！", pinyin: "maan6 maan6 haang4" },
  { yue: "小心啲！", zh: "小心一点！", pinyin: "siu2 sam1 di1" },
  { yue: "得闲饮茶！", zh: "有空喝茶！", pinyin: "dak1 haan4 jam2 caa4" },
  { yue: "唔好意思！", zh: "不好意思/对不起！", pinyin: "m4 hou2 ji3 si1" },
  { yue: "好嘢！", zh: "好棒！", pinyin: "hou2 je5" },
  { yue: "冇问题！", zh: "没问题！", pinyin: "mou5 man6 tai4" },
  { yue: "加油！", zh: "加油！", pinyin: "gaa1 jau4" },
  { yue: "恭喜发财！", zh: "恭喜发财！", pinyin: "gung1 hei2 faat3 coi4" },
  { yue: "身体健康！", zh: "身体健康！", pinyin: "san1 tai3 gin5 hong1" },
  { yue: "心想事成！", zh: "心想事成！", pinyin: "sam1 soeng2 si6 sing4" },
  { yue: "万事如意！", zh: "万事如意！", pinyin: "maan6 si6 jyu4 ji3" },
  { yue: "一路平安！", zh: "一路平安！", pinyin: "jat1 lou6 ping4 on1" },
  { yue: "再见！", zh: "再见！", pinyin: "zoi3 gin3" },
];

const commonPhrases = {
  greeting: [
    { yue: "早晨！", zh: "早上好！", pinyin: "zou2 san4" },
    { yue: "你好！", zh: "你好！", pinyin: "nei5 hou2" },
    { yue: "你好吗？", zh: "你好吗？", pinyin: "nei5 hou2 maa3" },
    { yue: "食咗饭未呀？", zh: "吃饭了吗？", pinyin: "sik6 zo2 faan6 mei6 aa3" },
    { yue: "最近点呀？", zh: "最近怎么样？", pinyin: "zeoi3 gan6 dim2 aa3" },
    { yue: "好耐冇见！", zh: "好久不见！", pinyin: "hou2 noi6 mou5 gin3" },
    { yue: "再见！", zh: "再见！", pinyin: "zoi3 gin3" },
    { yue: "拜拜！", zh: "拜拜！", pinyin: "baai1 baai3" },
    { yue: "听日见！", zh: "明天见！", pinyin: "ting1 jat6 gin3" },
    { yue: "晚安！", zh: "晚安！", pinyin: "maan5 on1" },
  ],
  daily: [
    { yue: "多谢你！", zh: "谢谢你！", pinyin: "do1 ze6 nei5" },
    { yue: "唔该晒！", zh: "非常感谢！", pinyin: "m4 goi1 saai3" },
    { yue: "唔好意思！", zh: "不好意思/对不起！", pinyin: "m4 hou2 ji3 si1" },
    { yue: "对唔住！", zh: "对不起！", pinyin: "deoi3 m4 zyu6" },
    { yue: "冇问题！", zh: "没问题！", pinyin: "mou5 man6 tai4" },
    { yue: "得闲饮茶！", zh: "有空喝茶！", pinyin: "dak1 haan4 jam2 caa4" },
    { yue: "慢慢行！", zh: "慢慢走！", pinyin: "maan6 maan6 haang4" },
    { yue: "小心啲！", zh: "小心一点！", pinyin: "siu2 sam1 di1" },
    { yue: "快啲啦！", zh: "快一点！", pinyin: "faai3 di1 laa1" },
    { yue: "等我一阵！", zh: "等我一下！", pinyin: "dang2 ngo5 jat1 zan6" },
  ],
  food: [
    { yue: "好食！", zh: "好吃！", pinyin: "hou2 sik6" },
    { yue: "好饮！", zh: "好喝！", pinyin: "hou2 jam2" },
    { yue: "我想食...", zh: "我想吃...", pinyin: "ngo5 soeng2 sik6" },
    { yue: "唔该，买单！", zh: "麻烦，结账！", pinyin: "m4 goi1, maai5 daan1" },
    { yue: "几多钱？", zh: "多少钱？", pinyin: "gei2 do1 cin2" },
    { yue: "太贵啦！", zh: "太贵了！", pinyin: "taai3 gwai3 laa1" },
    { yue: "平啲啦！", zh: "便宜一点！", pinyin: "peng4 di1 laa1" },
    { yue: "我唔要辣！", zh: "我不要辣！", pinyin: "ngo5 m4 jiu3 laat6" },
    { yue: "加多啲饭！", zh: "多加点饭！", pinyin: "gaa1 do1 di1 faan6" },
    { yue: "冻水！", zh: "冰水！", pinyin: "dung3 seoi2" },
  ],
  shopping: [
    { yue: "我想买...", zh: "我想买...", pinyin: "ngo5 soeng2 maai5" },
    { yue: "有冇大啲？", zh: "有大一点吗？", pinyin: "jau5 mou5 daai6 di1" },
    { yue: "有冇细啲？", zh: "有小一点吗？", pinyin: "jau5 mou5 sai3 di1" },
    { yue: "可以试下吗？", zh: "可以试一下吗？", pinyin: "ho2 ji5 si3 haa5 maa3" },
    { yue: "呢件几多钱？", zh: "这件多少钱？", pinyin: "ni1 gin6 gei2 do1 cin2" },
    { yue: "太贵啦！", zh: "太贵了！", pinyin: "taai3 gwai3 laa1" },
    { yue: "平啲啦！", zh: "便宜一点！", pinyin: "peng4 di1 laa1" },
    { yue: "我睇睇先！", zh: "我先看看！", pinyin: "ngo5 tai2 tai2 sin1" },
    { yue: "我要呢个！", zh: "我要这个！", pinyin: "ngo5 jiu3 ni1 go3" },
    { yue: "唔该，包装！", zh: "麻烦，包装！", pinyin: "m4 goi1, baau1 zong1" },
  ],
  emotion: [
    { yue: "我好开心！", zh: "我很开心！", pinyin: "ngo5 hou2 hoi1 sam1" },
    { yue: "我好挂住你！", zh: "我很想念你！", pinyin: "ngo5 hou2 gwaa3 zyu6 nei5" },
    { yue: "我好嬲！", zh: "我很生气！", pinyin: "ngo5 hou2 nau1" },
    { yue: "我好攰！", zh: "我很累！", pinyin: "ngo5 hou2 gui6" },
    { yue: "我好惊！", zh: "我很害怕！", pinyin: "ngo5 hou2 geng1" },
    { yue: "我好紧张！", zh: "我很紧张！", pinyin: "ngo5 hou2 gan2 zoeng1" },
    { yue: "我好兴奋！", zh: "我很兴奋！", pinyin: "ngo5 hou2 hing1 fan5" },
    { yue: "我好嬲啊！", zh: "我很生气啊！", pinyin: "ngo5 hou2 nau1 aa3" },
    { yue: "我好唔舍得！", zh: "我很舍不得！", pinyin: "ngo5 hou2 m4 se2 dak1" },
    { yue: "我好钟意你！", zh: "我很喜欢你！", pinyin: "ngo5 hou2 zung1 ji3 nei5" },
  ],
};

const quizQuestions = {
  easy: [
    { question: "「早晨」是什么意思？", options: ["早上好", "晚上好", "中午好", "再见"], correct: 0 },
    { question: "「多谢你」用粤语怎么说？", options: ["唔该你", "多谢你", "对唔住", "唔好意思"], correct: 1 },
    { question: "「食咗饭未呀？」是什么意思？", options: ["你去哪？", "你吃饭了吗？", "你好吗？", "再见！"], correct: 1 },
    { question: "「好食」是什么意思？", options: ["好喝", "好看", "好吃", "好听"], correct: 2 },
    { question: "「再见」用粤语怎么说？", options: ["早晨", "拜拜", "再见", "晚安"], correct: 2 },
    { question: "「唔该」是什么意思？", options: ["谢谢", "对不起", "你好", "再见"], correct: 0 },
    { question: "「你好吗？」用粤语怎么说？", options: ["你好吗？", "你食咗饭未？", "你叫咩名？", "你去边度？"], correct: 0 },
    { question: "「好饮」是什么意思？", options: ["好看", "好听", "好喝", "好吃"], correct: 2 },
    { question: "「慢慢行」是什么意思？", options: ["慢慢吃", "慢慢走", "慢慢说", "慢慢看"], correct: 1 },
    { question: "「小心啲」是什么意思？", options: ["快一点", "慢一点", "小心一点", "大声一点"], correct: 2 },
  ],
  medium: [
    { question: "「得闲饮茶」是什么意思？", options: ["有空喝茶", "现在喝茶", "不要喝茶", "明天喝茶"], correct: 0 },
    { question: "「好挂住你」是什么意思？", options: ["好喜欢你", "好想念你", "好担心你", "好关心你"], correct: 1 },
    { question: "「唔好意思」是什么意思？", options: ["不好意思", "很好意思", "没关系", "对不起"], correct: 0 },
    { question: "「几多钱」是什么意思？", options: ["多少钱", "什么钱", "哪里钱", "谁钱"], correct: 0 },
    { question: "「太贵啦」是什么意思？", options: ["太便宜了", "太贵了", "太好了", "太差了"], correct: 1 },
    { question: "「平啲啦」是什么意思？", options: ["贵一点", "便宜一点", "快一点", "慢一点"], correct: 1 },
    { question: "「我睇睇先」是什么意思？", options: ["我先看看", "我先买买", "我先走走", "我先吃吃"], correct: 0 },
    { question: "「好嬲」是什么意思？", options: ["好开心", "好生气", "好难过", "好害怕"], correct: 1 },
    { question: "「好攰」是什么意思？", options: ["好累", "好饿", "好困", "好忙"], correct: 0 },
    { question: "「好钟意」是什么意思？", options: ["好讨厌", "好喜欢", "好害怕", "好担心"], correct: 1 },
  ],
  hard: [
    { question: "「佢」是什么意思？", options: ["他/她", "你", "我", "它"], correct: 0 },
    { question: "「咗」是什么意思？", options: ["了", "在", "是", "有"], correct: 0 },
    { question: "「嘅」是什么意思？", options: ["的", "地", "得", "着"], correct: 0 },
    { question: "「喺」是什么意思？", options: ["在", "是", "有", "去"], correct: 0 },
    { question: "「唔」是什么意思？", options: ["不", "是", "有", "去"], correct: 0 },
    { question: "「啲」是什么意思？", options: ["一些", "很多", "全部", "没有"], correct: 0 },
    { question: "「喇」是什么意思？", options: ["了", "吗", "呢", "啊"], correct: 0 },
    { question: "「嚟」是什么意思？", options: ["来", "去", "走", "跑"], correct: 0 },
    { question: "「嘢」是什么意思？", options: ["东西", "人", "地方", "时间"], correct: 0 },
    { question: "「噉」是什么意思？", options: ["这样", "那样", "什么", "哪里"], correct: 0 },
  ],
};

let currentPhraseCategory = "greeting";
let currentQuiz = [];
let currentQuestionIndex = 0;
let quizScore = 0;
let quizDifficulty = "medium";

function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  return dailyQuotes[dayOfYear % dailyQuotes.length];
}

function renderDailyQuote() {
  const quote = getDailyQuote();
  document.getElementById("homeQuoteYue").textContent = quote.yue;
  document.getElementById("homeQuoteZh").textContent = quote.zh;
  document.getElementById("homeQuotePinyin").textContent = quote.pinyin;
  
  document.getElementById("dailyQuoteYue").textContent = quote.yue;
  document.getElementById("dailyQuoteZh").textContent = quote.zh;
  document.getElementById("dailyQuotePinyin").textContent = quote.pinyin;
}

function playDailyQuote() {
  const quote = getDailyQuote();
  const words = quote.yue.replace(/[！？，。、]/g, "").split("");
  words.forEach((word, index) => {
    setTimeout(() => {
      const dictResult = findYueWords(word);
      if (dictResult.length > 0 && dictResult[0].pinyin) {
        playYuePinyin(dictResult[0].pinyin);
      }
    }, index * 800);
  });
}

function renderPhraseList(category) {
  const phraseList = document.getElementById("phraseList");
  const phrases = commonPhrases[category] || [];
  
  phraseList.innerHTML = phrases.map((phrase, index) => `
    <div class="phrase-item">
      <div class="phrase-content">
        <div class="yue">${phrase.yue}</div>
        <div class="zh">${phrase.zh}</div>
        <div class="pinyin">${phrase.pinyin}</div>
      </div>
      <div class="phrase-actions">
        <button class="icon-btn phrase-play-btn" data-pinyin="${phrase.pinyin}" title="播放发音">🔊</button>
        <button class="icon-btn phrase-fav-btn" data-phrase="${phrase.yue}" title="收藏">⭐</button>
      </div>
    </div>
  `).join("");
  
  phraseList.querySelectorAll(".phrase-play-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      playYuePinyin(btn.dataset.pinyin);
      trackAudioPlayed();
      trackPhraseLearned();
    });
  });
  
  phraseList.querySelectorAll(".phrase-fav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addToFavorites(btn.dataset.phrase, "");
      alert("已添加到收藏夹！");
    });
  });
}

function startQuiz() {
  quizDifficulty = document.getElementById("quizDifficulty").value;
  currentQuiz = [...quizQuestions[quizDifficulty]].sort(() => Math.random() - 0.5).slice(0, 10);
  currentQuestionIndex = 0;
  quizScore = 0;
  
  document.getElementById("quizStart").style.display = "none";
  document.getElementById("quizQuestion").style.display = "block";
  
  renderQuestion();
}

function renderQuestion() {
  const question = currentQuiz[currentQuestionIndex];
  document.getElementById("questionCounter").textContent = `问题 ${currentQuestionIndex + 1}/${currentQuiz.length}`;
  document.getElementById("currentScore").textContent = `得分: ${quizScore}`;
  document.getElementById("questionText").textContent = question.question;
  document.getElementById("questionFeedback").textContent = "";
  document.getElementById("questionFeedback").className = "question-feedback";
  document.getElementById("nextQuestionBtn").style.display = "none";
  
  const optionsContainer = document.getElementById("questionOptions");
  optionsContainer.innerHTML = question.options.map((option, index) => `
    <button class="question-option" data-index="${index}">${option}</button>
  `).join("");
  
  optionsContainer.querySelectorAll(".question-option").forEach(btn => {
    btn.addEventListener("click", () => handleAnswer(parseInt(btn.dataset.index)));
  });
}

function handleAnswer(selectedIndex) {
  const question = currentQuiz[currentQuestionIndex];
  const options = document.querySelectorAll(".question-option");
  const feedback = document.getElementById("questionFeedback");
  
  options.forEach(btn => btn.classList.add("disabled"));
  
  if (selectedIndex === question.correct) {
    options[selectedIndex].classList.add("correct");
    feedback.textContent = "✅ 正确！";
    feedback.classList.add("correct");
    quizScore++;
  } else {
    options[selectedIndex].classList.add("incorrect");
    options[question.correct].classList.add("correct");
    feedback.textContent = `❌ 错误！正确答案是：${question.options[question.correct]}`;
    feedback.classList.add("incorrect");
  }
  
  document.getElementById("currentScore").textContent = `得分: ${quizScore}`;
  document.getElementById("nextQuestionBtn").style.display = "block";
}

function nextQuestion() {
  currentQuestionIndex++;
  
  if (currentQuestionIndex >= currentQuiz.length) {
    showQuizResult();
  } else {
    renderQuestion();
  }
}

function showQuizResult() {
  document.getElementById("quizQuestion").style.display = "none";
  document.getElementById("quizStart").style.display = "block";
  
  const percentage = Math.round((quizScore / currentQuiz.length) * 100);
  let message = "";
  if (percentage >= 90) {
    message = "🎉 太棒了！你的粤语水平非常好！";
  } else if (percentage >= 70) {
    message = "👍 不错！继续加油！";
  } else if (percentage >= 50) {
    message = "💪 还可以，多练习就会进步！";
  } else {
    message = "📚 需要多学习，不要气馁！";
  }
  
  document.getElementById("quizScore").innerHTML = `
    <p>测验完成！</p>
    <p>得分：${quizScore}/${currentQuiz.length} (${percentage}%)</p>
    <p>${message}</p>
  `;
  
  saveQuizScore(quizScore, currentQuiz.length, quizDifficulty);
}

function saveQuizScore(score, total, difficulty) {
  const scores = JSON.parse(localStorage.getItem("dls-ai-quiz-scores") || "[]");
  scores.push({
    score,
    total,
    difficulty,
    date: new Date().toISOString(),
  });
  localStorage.setItem("dls-ai-quiz-scores", JSON.stringify(scores));
  
  updateProgressStats();
}

function trackAudioPlayed() {
  const stats = JSON.parse(localStorage.getItem("dls-ai-progress-stats") || "{}");
  stats.audioPlayed = (stats.audioPlayed || 0) + 1;
  localStorage.setItem("dls-ai-progress-stats", JSON.stringify(stats));
  updateProgressStats();
}

function trackPhraseLearned() {
  const stats = JSON.parse(localStorage.getItem("dls-ai-progress-stats") || "{}");
  stats.phrasesLearned = (stats.phrasesLearned || 0) + 1;
  localStorage.setItem("dls-ai-progress-stats", JSON.stringify(stats));
  updateProgressStats();
}

function updateProgressStats() {
  const stats = JSON.parse(localStorage.getItem("dls-ai-progress-stats") || "{}");
  const quizScores = JSON.parse(localStorage.getItem("dls-ai-quiz-scores") || "[]");
  const favorites = JSON.parse(localStorage.getItem("dls-ai-favorites") || "[]");
  
  const phrasesLearned = stats.phrasesLearned || 0;
  const quizCompleted = quizScores.length;
  const favoritesCount = favorites.length;
  const audioPlayed = stats.audioPlayed || 0;
  
  document.getElementById("statPhrasesLearned").textContent = phrasesLearned;
  document.getElementById("statQuizCompleted").textContent = quizCompleted;
  document.getElementById("statFavorites").textContent = favoritesCount;
  document.getElementById("statAudioPlayed").textContent = audioPlayed;
  
  const totalGoal = 100;
  const currentProgress = Math.min(
    Math.round(((phrasesLearned + quizCompleted * 5 + favoritesCount + audioPlayed) / totalGoal) * 100),
    100
  );
  
  document.getElementById("progressPercentage").textContent = `${currentProgress}%`;
  document.getElementById("progressFill").style.width = `${currentProgress}%`;
}

document.getElementById("homePlayQuoteBtn").addEventListener("click", () => {
  playDailyQuote();
  trackAudioPlayed();
});
document.getElementById("dailyPlayQuoteBtn").addEventListener("click", () => {
  playDailyQuote();
  trackAudioPlayed();
});
document.getElementById("dailyNextQuoteBtn").addEventListener("click", () => {
  const randomIndex = Math.floor(Math.random() * dailyQuotes.length);
  const quote = dailyQuotes[randomIndex];
  document.getElementById("dailyQuoteYue").textContent = quote.yue;
  document.getElementById("dailyQuoteZh").textContent = quote.zh;
  document.getElementById("dailyQuotePinyin").textContent = quote.pinyin;
});
document.getElementById("dailyFavoriteQuoteBtn").addEventListener("click", () => {
  const yue = document.getElementById("dailyQuoteYue").textContent;
  const zh = document.getElementById("dailyQuoteZh").textContent;
  if (yue && yue !== "加载中...") {
    addToFavorites(yue, zh);
    alert("已添加到收藏夹！");
  }
});

document.querySelectorAll(".phrase-cat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".phrase-cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentPhraseCategory = btn.dataset.cat;
    renderPhraseList(currentPhraseCategory);
  });
});

document.getElementById("startQuizBtn").addEventListener("click", startQuiz);
document.getElementById("nextQuestionBtn").addEventListener("click", nextQuestion);

const tonePracticeWords = [
  { yue: "诗", pinyin: "si1", tone: 1 },
  { yue: "史", pinyin: "si2", tone: 2 },
  { yue: "试", pinyin: "si3", tone: 3 },
  { yue: "时", pinyin: "si4", tone: 4 },
  { yue: "市", pinyin: "si5", tone: 5 },
  { yue: "是", pinyin: "si6", tone: 6 },
  { yue: "三", pinyin: "saam1", tone: 1 },
  { yue: "产", pinyin: "caan2", tone: 2 },
  { yue: "山", pinyin: "saan1", tone: 1 },
  { yue: "眼", pinyin: "ngaan5", tone: 5 },
  { yue: "花", pinyin: "faa1", tone: 1 },
  { yue: "华", pinyin: "waa4", tone: 4 },
  { yue: "化", pinyin: "faa3", tone: 3 },
  { yue: "下", pinyin: "haa5", tone: 5 },
  { yue: "虾", pinyin: "haa1", tone: 1 },
  { yue: "霞", pinyin: "haa4", tone: 4 },
  { yue: "马", pinyin: "maa5", tone: 5 },
  { yue: "妈", pinyin: "maa1", tone: 1 },
  { yue: "麻", pinyin: "maa4", tone: 4 },
  { yue: "骂", pinyin: "maa6", tone: 6 },
];

let currentTonePractice = [];
let currentToneQuestionIndex = 0;
let toneScore = 0;
let currentToneWord = null;

function startTonePractice() {
  currentTonePractice = [...tonePracticeWords].sort(() => Math.random() - 0.5).slice(0, 10);
  currentToneQuestionIndex = 0;
  toneScore = 0;
  
  document.querySelector(".game-start").style.display = "none";
  document.getElementById("toneQuestion").style.display = "block";
  
  renderToneQuestion();
}

function renderToneQuestion() {
  currentToneWord = currentTonePractice[currentToneQuestionIndex];
  document.getElementById("toneQuestionCounter").textContent = `问题 ${currentToneQuestionIndex + 1}/${currentTonePractice.length}`;
  document.getElementById("toneScore").textContent = `得分: ${toneScore}`;
  document.getElementById("toneFeedback").textContent = "";
  document.getElementById("toneFeedback").className = "tone-feedback";
  document.getElementById("nextToneBtn").style.display = "none";
  
  const toneOptions = document.getElementById("toneOptions");
  const toneNames = ["高平调", "高升调", "中平调", "低降调", "低升调", "低平调"];
  toneOptions.innerHTML = toneNames.map((name, index) => `
    <button class="tone-option" data-tone="${index + 1}">
      <div>${index + 1}</div>
      <div>${name}</div>
    </button>
  `).join("");
  
  toneOptions.querySelectorAll(".tone-option").forEach(btn => {
    btn.addEventListener("click", () => handleToneAnswer(parseInt(btn.dataset.tone)));
  });
}

function handleToneAnswer(selectedTone) {
  const options = document.querySelectorAll(".tone-option");
  const feedback = document.getElementById("toneFeedback");
  
  options.forEach(btn => btn.classList.add("disabled"));
  
  if (selectedTone === currentToneWord.tone) {
    options[selectedTone - 1].classList.add("correct");
    feedback.textContent = `✅ 正确！"${currentToneWord.yue}"的声调是${currentToneWord.tone}声（${["高平调", "高升调", "中平调", "低降调", "低升调", "低平调"][currentToneWord.tone - 1]}）`;
    feedback.classList.add("correct");
    toneScore++;
  } else {
    options[selectedTone - 1].classList.add("incorrect");
    options[currentToneWord.tone - 1].classList.add("correct");
    feedback.textContent = `❌ 错误！"${currentToneWord.yue}"(${currentToneWord.pinyin})的声调是${currentToneWord.tone}声（${["高平调", "高升调", "中平调", "低降调", "低升调", "低平调"][currentToneWord.tone - 1]}）`;
    feedback.classList.add("incorrect");
  }
  
  document.getElementById("toneScore").textContent = `得分: ${toneScore}`;
  document.getElementById("nextToneBtn").style.display = "block";
}

function nextToneQuestion() {
  currentToneQuestionIndex++;
  
  if (currentToneQuestionIndex >= currentTonePractice.length) {
    showToneResult();
  } else {
    renderToneQuestion();
  }
}

function showToneResult() {
  document.getElementById("toneQuestion").style.display = "none";
  document.querySelector(".game-start").style.display = "block";
  
  const percentage = Math.round((toneScore / currentTonePractice.length) * 100);
  let message = "";
  if (percentage >= 90) {
    message = "🎉 太棒了！你的声调掌握非常好！";
  } else if (percentage >= 70) {
    message = "👍 不错！继续练习声调！";
  } else if (percentage >= 50) {
    message = "💪 还可以，多听多练就会进步！";
  } else {
    message = "📚 需要多练习声调，不要气馁！";
  }
  
  document.querySelector(".game-start p").textContent = `练习完成！得分：${toneScore}/${currentTonePractice.length} (${percentage}%) ${message}`;
}

document.querySelectorAll(".tone-play-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    playYuePinyin(btn.dataset.pinyin);
    trackAudioPlayed();
  });
});

document.getElementById("startTonePracticeBtn").addEventListener("click", startTonePractice);
document.getElementById("playToneBtn").addEventListener("click", () => {
  if (currentToneWord) {
    playYuePinyin(currentToneWord.pinyin);
    trackAudioPlayed();
  }
});
document.getElementById("nextToneBtn").addEventListener("click", nextToneQuestion);

renderDailyQuote();
renderPhraseList("greeting");
updateProgressStats();

// 初始化页面导航
initNavigation();

loadConfigToForm();
renderFavorites();
renderTranslateHistory();
loadYueDictionary().catch(() => {
  // 首次预加载失败时，保留在查询时重试。
});
