const AUTH_TOKEN_KEY = "dls-ai-auth-token";
const AUTH_USER_KEY = "dls-ai-auth-user";

const ROLE_LABELS = {
  student: "学生",
  parent: "家长",
  teacher: "老师",
  admin: "管理员",
};

const SYNC_DATA_KEYS = [
  "dls-ai-config",
  "dls-ai-favorites",
  "dls-ai-translate-history",
  "dls-ai-chat-history",
  "dls-ai-quiz-scores",
  "dls-ai-progress-stats",
  "dls-ai-wordbook",
  "dls-ai-checkin",
  "dls-ai-daily-tasks",
  "dls-ai-achievements",
  "dls-ai-xp",
  "dls-ai-custom-quotes",
];

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function getCurrentUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setAuthSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

async function authRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return { ok: response.ok, status: response.status, data: payload };
}

function collectLocalUserData() {
  const data = {};
  for (const key of SYNC_DATA_KEYS) {
    const val = localStorage.getItem(key);
    if (val != null) data[key] = val;
  }
  return data;
}

function applyRemoteUserData(data) {
  if (!data || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      localStorage.setItem(key, value);
    }
  }
}

async function syncUserDataToServer() {
  if (!getAuthToken()) return;
  await authRequest("/auth/data", {
    method: "PUT",
    body: JSON.stringify({ data: collectLocalUserData() }),
  });
}

async function pullUserDataFromServer() {
  if (!getAuthToken()) return null;
  const { ok, data } = await authRequest("/auth/data");
  if (!ok) return null;
  applyRemoteUserData(data.data);
  return data.data;
}

async function authRegister(username, password, displayName, role) {
  return authRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName, role }),
  });
}

async function authLogin(username, password) {
  return authRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

async function authLogout() {
  if (getAuthToken()) {
    await syncUserDataToServer();
    await authRequest("/auth/logout", { method: "POST" });
  }
  clearAuthSession();
  updateNavAuthUI();
}

async function authFetchMe() {
  if (!getAuthToken()) return null;
  const { ok, data } = await authRequest("/auth/me");
  if (!ok) {
    clearAuthSession();
    updateNavAuthUI();
    return null;
  }
  setAuthSession(getAuthToken(), data.user);
  return data.user;
}

function updateNavAuthUI() {
  const user = getCurrentUser();
  const guestEl = document.getElementById("navAuthGuest");
  const userEl = document.getElementById("navAuthUser");
  const nameEl = document.getElementById("navUsername");
  const roleEl = document.getElementById("navUserRole");
  if (!guestEl || !userEl) return;

  if (user) {
    guestEl.hidden = true;
    userEl.hidden = false;
    if (nameEl) nameEl.textContent = user.displayName || user.username;
    if (roleEl) {
      const label = user.roleLabel || ROLE_LABELS[user.role] || ROLE_LABELS.student;
      roleEl.textContent = label;
      roleEl.dataset.role = user.role || "student";
    }
  } else {
    guestEl.hidden = false;
    userEl.hidden = true;
  }
}

function showAuthMessage(text, isError = false) {
  const el = document.getElementById("authMessage");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "auth-message error" : "auth-message success";
  el.hidden = !text;
}

function switchAuthTab(mode) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabLogin = document.getElementById("authTabLogin");
  const tabRegister = document.getElementById("authTabRegister");
  const isLogin = mode === "login";

  if (loginForm) loginForm.hidden = !isLogin;
  if (registerForm) registerForm.hidden = isLogin;
  if (tabLogin) tabLogin.classList.toggle("active", isLogin);
  if (tabRegister) tabRegister.classList.toggle("active", !isLogin);
  showAuthMessage("");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = document.getElementById("loginUsername")?.value.trim();
  const password = document.getElementById("loginPassword")?.value || "";
  if (!username || !password) {
    showAuthMessage("请填写用户名和密码", true);
    return;
  }

  showAuthMessage("登录中…");
  const { ok, data } = await authLogin(username, password);
  if (!ok) {
    showAuthMessage(data.error || "登录失败", true);
    return;
  }

  setAuthSession(data.token, data.user);
  await pullUserDataFromServer();
  updateNavAuthUI();
  refreshAppAfterAuthChange();
  showAuthMessage("登录成功");
  if (typeof showPixelToast === "function") {
    const roleLabel = data.user.roleLabel || ROLE_LABELS[data.user.role] || "";
    const suffix = roleLabel ? `（${roleLabel}）` : "";
    showPixelToast(`👋 欢迎，${data.user.displayName || data.user.username}${suffix}`);
  }
  navigateTo("home");
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const username = document.getElementById("registerUsername")?.value.trim();
  const displayName = document.getElementById("registerDisplayName")?.value.trim();
  const password = document.getElementById("registerPassword")?.value || "";
  const password2 = document.getElementById("registerPassword2")?.value || "";
  const roleInput = document.querySelector('input[name="registerRole"]:checked');
  const role = roleInput?.value || "";

  if (!username || !password) {
    showAuthMessage("请填写用户名和密码", true);
    return;
  }
  if (!role) {
    showAuthMessage("请选择身份权限", true);
    return;
  }
  if (password !== password2) {
    showAuthMessage("两次输入的密码不一致", true);
    return;
  }

  showAuthMessage("注册中…");
  const { ok, data } = await authRegister(username, password, displayName || username, role);
  if (!ok) {
    showAuthMessage(data.error || "注册失败", true);
    return;
  }

  setAuthSession(data.token, data.user);
  await syncUserDataToServer();
  updateNavAuthUI();
  refreshAppAfterAuthChange();
  showAuthMessage("注册成功");
  if (typeof showPixelToast === "function") {
    const roleLabel = data.user.roleLabel || ROLE_LABELS[data.user.role] || "";
    showPixelToast(`✅ 账号已创建${roleLabel ? ` · ${roleLabel}` : ""}`);
  }
  navigateTo("home");
}

function refreshAppAfterAuthChange() {
  if (typeof renderFavorites === "function") renderFavorites();
  if (typeof renderTranslateHistory === "function") renderTranslateHistory();
  if (typeof loadConversation === "function") loadConversation();
  if (typeof renderWordbook === "function") renderWordbook();
  if (typeof updateCheckinUI === "function") updateCheckinUI();
  if (typeof renderDailyTasks === "function") renderDailyTasks();
  if (typeof renderAchievement === "function") renderAchievement();
  if (typeof updateProgressStats === "function") updateProgressStats();
}

const OAUTH_ERROR_MESSAGES = {
  oauth_cancelled: "已取消 GitHub 登录",
  oauth_state_invalid: "登录状态校验失败，请重试",
  oauth_token_failed: "GitHub 授权失败，请重试",
  oauth_profile_failed: "无法获取 GitHub 用户信息",
  oauth_server_error: "OAuth 服务异常，请稍后重试",
};

function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("oauth_token");
  const error = params.get("oauth_error");
  if (!token && !error) return;

  // 清理 URL 中的 OAuth 参数
  window.history.replaceState({}, document.title, window.location.pathname);

  if (error) {
    navigateTo("auth");
    showAuthMessage(OAUTH_ERROR_MESSAGES[error] || "GitHub 登录失败", true);
    updateNavAuthUI();
    return;
  }

  let user = null;
  try {
    user = JSON.parse(params.get("oauth_user") || "null");
  } catch {
    user = null;
  }
  setAuthSession(token, user || {});
  updateNavAuthUI();
  refreshAppAfterAuthChange();
  if (typeof showPixelToast === "function") {
    const name = user ? user.displayName || user.username : "";
    showPixelToast(`👋 GitHub 登录成功${name ? "，欢迎 " + name : ""}`);
  }
  // 拉取最新用户信息以校验会话
  authFetchMe();
  navigateTo("home");
}

function initAuthUI() {
  document.getElementById("authTabLogin")?.addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("authTabRegister")?.addEventListener("click", () => switchAuthTab("register"));
  document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
  document.getElementById("registerForm")?.addEventListener("submit", handleRegisterSubmit);
  document.getElementById("oauthGithubBtn")?.addEventListener("click", () => {
    // OAuth 起点必须是整页跳转（服务端 302 到 GitHub）
    window.location.href = "/auth/oauth/github";
  });
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await authLogout();
    if (typeof showPixelToast === "function") showPixelToast("已退出登录");
    navigateTo("home");
  });

  handleOAuthCallback();

  authFetchMe().then((user) => {
    if (user) {
      pullUserDataFromServer().then(refreshAppAfterAuthChange);
    }
    updateNavAuthUI();
  });

  window.addEventListener("beforeunload", () => {
    const token = getAuthToken();
    if (!token) return;
    fetch("/auth/data", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data: collectLocalUserData() }),
      keepalive: true,
    });
  });
}

window.syncUserDataToServer = syncUserDataToServer;
window.getCurrentUser = getCurrentUser;
window.getAuthToken = getAuthToken;
window.getCurrentUserRole = () => getCurrentUser()?.role || null;
window.ROLE_LABELS = ROLE_LABELS;

document.addEventListener("DOMContentLoaded", initAuthUI);
