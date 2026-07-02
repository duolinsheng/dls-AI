const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const USER_DATA_DIR = path.join(DATA_DIR, "user-data");
const USERS_SEED_FILE = path.join(__dirname, "..", "eval", "data", "users.seed.json");
const USER_DATA_SEED_FILE = path.join(__dirname, "..", "eval", "data", "user-data.seed.json");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LEN = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const ADMIN_USERNAME = "admin114514Chessbrain";

const USER_ROLES = ["student", "parent", "teacher", "admin"];
const REGISTERABLE_ROLES = ["student", "parent", "teacher"];
const ROLE_LABELS = {
  student: "学生",
  parent: "家长",
  teacher: "老师",
  admin: "管理员",
};
const DEFAULT_ROLE = "student";

let usersCache = null;
let sessionsCache = null;

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}

function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const hash = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(record.hash, "hex"));
}

function loadUsers() {
  if (usersCache) return usersCache;
  usersCache = readJsonFile(USERS_FILE, { users: [] });
  if (!Array.isArray(usersCache.users)) usersCache.users = [];
  return usersCache;
}

function saveUsers(data) {
  usersCache = data;
  writeJsonFile(USERS_FILE, data);
}

function loadSessions() {
  if (sessionsCache) return sessionsCache;
  sessionsCache = readJsonFile(SESSIONS_FILE, { sessions: {} });
  if (!sessionsCache.sessions || typeof sessionsCache.sessions !== "object") {
    sessionsCache.sessions = {};
  }
  return sessionsCache;
}

function saveSessions(data) {
  sessionsCache = data;
  writeJsonFile(SESSIONS_FILE, data);
}

function pruneExpiredSessions() {
  const store = loadSessions();
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(store.sessions)) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      delete store.sessions[token];
      changed = true;
    }
  }
  if (changed) saveSessions(store);
}

function seedFromEvalIfNeeded() {
  ensureDataDirs();
  if (!fs.existsSync(USERS_FILE) && fs.existsSync(USERS_SEED_FILE)) {
    const seed = readJsonFile(USERS_SEED_FILE, { users: [] });
    const users = (seed.users || []).map((item) => {
      const cred = createPasswordRecord(item.password);
      return {
        id: crypto.randomUUID(),
        username: item.username,
        displayName: item.displayName || item.username,
        role: normalizeRole(item.role),
        password: cred,
        createdAt: Date.now(),
      };
    });
    saveUsers({ users });
    console.log(`[Auth] 已从 eval 种子初始化 ${users.length} 个测试账号`);

    if (fs.existsSync(USER_DATA_SEED_FILE)) {
      const dataSeed = readJsonFile(USER_DATA_SEED_FILE, {});
      const demoUser = users.find((u) => u.username === "demo");
      if (demoUser && dataSeed.demo) {
        writeJsonFile(path.join(USER_DATA_DIR, `${demoUser.id}.json`), dataSeed.demo);
        console.log("[Auth] 已为 demo 用户写入示例学习数据");
      }
    }
  }
}

function normalizeRole(role) {
  const value = (role || "").trim().toLowerCase();
  return USER_ROLES.includes(value) ? value : DEFAULT_ROLE;
}

function publicUser(user) {
  const role = normalizeRole(user.role);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role,
    roleLabel: ROLE_LABELS[role],
    createdAt: user.createdAt,
  };
}

function findUserByUsername(username) {
  const normalized = (username || "").trim().toLowerCase();
  return loadUsers().users.find((u) => u.username.toLowerCase() === normalized) || null;
}

function findUserById(userId) {
  return loadUsers().users.find((u) => u.id === userId) || null;
}

function createSession(userId) {
  pruneExpiredSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const store = loadSessions();
  store.sessions[token] = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  saveSessions(store);
  return token;
}

function getSession(token) {
  if (!token) return null;
  pruneExpiredSessions();
  const session = loadSessions().sessions[token];
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}

function deleteSession(token) {
  const store = loadSessions();
  if (store.sessions[token]) {
    delete store.sessions[token];
    saveSessions(store);
  }
}

function validateRegisterInput(body) {
  const username = (body.username || "").trim();
  const password = body.password || "";
  const displayName = (body.displayName || username).trim();
  const role = normalizeRole(body.role);

  if (!body.role || !REGISTERABLE_ROLES.includes(String(body.role).trim().toLowerCase())) {
    return { error: "请选择有效的身份权限（学生/家长/老师）", status: 400 };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return { error: "用户名需为 3-32 位字母、数字或下划线", status: 400 };
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return { error: `密码至少 ${MIN_PASSWORD_LEN} 位`, status: 400 };
  }
  if (findUserByUsername(username)) {
    return { error: "用户名已被注册", status: 409 };
  }
  return { username, password, displayName, role };
}

function registerUser(body) {
  const validated = validateRegisterInput(body);
  if (validated.error) return validated;

  const user = {
    id: crypto.randomUUID(),
    username: validated.username,
    displayName: validated.displayName,
    role: validated.role,
    password: createPasswordRecord(validated.password),
    createdAt: Date.now(),
  };

  const data = loadUsers();
  data.users.push(user);
  saveUsers(data);

  const token = createSession(user.id);
  return { status: 201, token, user: publicUser(user) };
}

function loginUser(body) {
  const username = (body.username || "").trim();
  const password = body.password || "";
  const user = findUserByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    return { error: "用户名或密码错误", status: 401 };
  }

  const token = createSession(user.id);
  return { status: 200, token, user: publicUser(user) };
}

function getUserDataPath(userId) {
  return path.join(USER_DATA_DIR, `${userId}.json`);
}

function getUserData(userId) {
  return readJsonFile(getUserDataPath(userId), {});
}

function saveUserData(userId, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "数据格式无效", status: 400 };
  }
  writeJsonFile(getUserDataPath(userId), payload);
  return { status: 200, saved: true };
}

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > MAX_REQUEST_BODY_BYTES) {
      reject(new Error("Request body too large"));
      return;
    }
    const chunks = [];
    let totalLen = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      totalLen += chunk.length;
      if (totalLen > MAX_REQUEST_BODY_BYTES) {
        aborted = true;
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
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
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function requireAuth(req) {
  const token = getBearerToken(req);
  const session = getSession(token);
  if (!session) return { error: "未登录或会话已过期", status: 401 };
  const user = findUserById(session.userId);
  if (!user) return { error: "用户不存在", status: 401 };
  return { token, session, user };
}

function requireRoles(auth, roles) {
  if (auth.error) return auth;
  if (!roles.includes(normalizeRole(auth.user.role))) {
    return { error: "无权访问此功能", status: 403 };
  }
  return auth;
}

function summarizeUserData(userId) {
  const data = getUserData(userId);
  const parseJson = (key, fallback) => {
    try {
      return JSON.parse(data[key] ?? JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };
  const quizScores = parseJson("dls-ai-quiz-scores", []);
  const favorites = parseJson("dls-ai-favorites", []);
  const wordbook = parseJson("dls-ai-wordbook", []);
  const stats = parseJson("dls-ai-progress-stats", {});
  const checkin = parseJson("dls-ai-checkin", {});
  return {
    xp: parseInt(data["dls-ai-xp"] || "0", 10),
    quizCount: Array.isArray(quizScores) ? quizScores.length : 0,
    favoritesCount: Array.isArray(favorites) ? favorites.length : 0,
    wordbookCount: Array.isArray(wordbook) ? wordbook.length : 0,
    phrasesLearned: stats.phrasesLearned || 0,
    audioPlayed: stats.audioPlayed || 0,
    checkinStreak: checkin.streak || 0,
  };
}

const ASSIGNMENTS_FILE = path.join(DATA_DIR, "assignments.json");

function loadAssignments() {
  const store = readJsonFile(ASSIGNMENTS_FILE, { assignments: [] });
  if (!Array.isArray(store.assignments)) store.assignments = [];
  return store;
}

function saveAssignments(store) {
  writeJsonFile(ASSIGNMENTS_FILE, store);
}

function buildDashboard(authUser) {
  const role = normalizeRole(authUser.role);

  if (role === "admin") {
    const data = loadUsers();
    const byRole = { student: 0, parent: 0, teacher: 0, admin: 0 };
    for (const u of data.users) {
      const r = normalizeRole(u.role);
      if (byRole[r] !== undefined) byRole[r] += 1;
    }
    return {
      role,
      counts: { total: data.users.length, byRole },
      users: data.users.map((u) => ({
        ...publicUser(u),
        stats: summarizeUserData(u.id),
      })),
    };
  }

  if (role === "teacher") {
    const students = loadUsers().users.filter((u) => normalizeRole(u.role) === "student");
    return {
      role,
      students: students.map((u) => ({
        ...publicUser(u),
        stats: summarizeUserData(u.id),
      })),
      assignments: loadAssignments().assignments.filter(
        (a) => a.teacherId === authUser.id,
      ),
    };
  }

  if (role === "parent") {
    const students = loadUsers().users.filter((u) => normalizeRole(u.role) === "student");
    const parentData = getUserData(authUser.id);
    return {
      role,
      linkedStudentUsername: parentData["dls-ai-linked-student"] || "demo",
      parentNote: parentData["dls-ai-parent-note"] || "",
      weeklyGoal: parentData["dls-ai-parent-goal"] || "",
      students: students.map((u) => ({
        ...publicUser(u),
        stats: summarizeUserData(u.id),
      })),
      tips: [
        "每天固定 15 分钟亲子粤语时间，比一次长时间学习更有效。",
        "鼓励孩子跟读发音，不要急于纠正每一个错音。",
        "用日常场景（吃饭、出门）里的短语做复习，记得更牢。",
      ],
    };
  }

  const stats = summarizeUserData(authUser.id);
  const assignments = loadAssignments().assignments;
  return {
    role,
    stats,
    assignments: assignments.filter(
      (a) => a.target === "all" || a.targetStudentId === authUser.id,
    ),
  };
}

function updateUserRole(operator, targetUserId, newRole) {
  if (normalizeRole(operator.role) !== "admin") {
    return { error: "无权访问此功能", status: 403 };
  }
  if (!REGISTERABLE_ROLES.includes(newRole)) {
    return { error: "只能设置为学生/家长/老师", status: 400 };
  }
  const data = loadUsers();
  const user = data.users.find((u) => u.id === targetUserId);
  if (!user) return { error: "用户不存在", status: 404 };
  if (normalizeRole(user.role) === "admin") {
    return { error: "不能修改管理员角色", status: 403 };
  }
  user.role = newRole;
  saveUsers(data);
  return { status: 200, user: publicUser(user) };
}

function createAssignment(teacher, body) {
  const title = (body.title || "").trim();
  const content = (body.content || "").trim();
  const target = body.target === "all" ? "all" : (body.targetStudentId || "all");
  if (!title) return { error: "请填写练习标题", status: 400 };

  const store = loadAssignments();
  const item = {
    id: crypto.randomUUID(),
    teacherId: teacher.id,
    teacherName: teacher.displayName || teacher.username,
    title,
    content,
    target,
    targetStudentId: target === "all" ? null : target,
    createdAt: Date.now(),
  };
  store.assignments.unshift(item);
  saveAssignments(store);
  return { status: 201, assignment: item };
}

function saveParentSettings(userId, body) {
  const data = getUserData(userId);
  if (body.linkedStudentUsername !== undefined) {
    const name = String(body.linkedStudentUsername).trim();
    const student = findUserByUsername(name);
    if (!student || normalizeRole(student.role) !== "student") {
      return { error: "关联的学生账号不存在", status: 400 };
    }
    data["dls-ai-linked-student"] = student.username;
  }
  if (body.parentNote !== undefined) {
    data["dls-ai-parent-note"] = String(body.parentNote).slice(0, 500);
  }
  if (body.weeklyGoal !== undefined) {
    data["dls-ai-parent-goal"] = String(body.weeklyGoal).slice(0, 200);
  }
  writeJsonFile(getUserDataPath(userId), data);
  return { status: 200, ok: true };
}

async function handleAuthRequest(req, res, requestPath) {
  try {
    if (requestPath === "/auth/register" && req.method === "POST") {
      const body = await readRequestBody(req);
      const result = registerUser(body);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { token: result.token, user: result.user });
    }

    if (requestPath === "/auth/login" && req.method === "POST") {
      const body = await readRequestBody(req);
      const result = loginUser(body);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { token: result.token, user: result.user });
    }

    if (requestPath === "/auth/logout" && req.method === "POST") {
      const token = getBearerToken(req);
      deleteSession(token);
      return sendJson(res, 200, { ok: true });
    }

    if (requestPath === "/auth/me" && req.method === "GET") {
      const auth = requireAuth(req);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      return sendJson(res, 200, { user: publicUser(auth.user) });
    }

    if (requestPath === "/auth/data" && req.method === "GET") {
      const auth = requireAuth(req);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      return sendJson(res, 200, { data: getUserData(auth.user.id) });
    }

    if (requestPath === "/auth/data" && req.method === "PUT") {
      const auth = requireAuth(req);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      const body = await readRequestBody(req);
      const result = saveUserData(auth.user.id, body.data);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { ok: true });
    }

    if (requestPath === "/auth/dashboard" && req.method === "GET") {
      const auth = requireAuth(req);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      return sendJson(res, 200, buildDashboard(auth.user));
    }

    if (requestPath === "/auth/parent/settings" && req.method === "PUT") {
      const auth = requireRoles(requireAuth(req), ["parent"]);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      const body = await readRequestBody(req);
      const result = saveParentSettings(auth.user.id, body);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { ok: true });
    }

    if (requestPath === "/auth/teacher/assignments" && req.method === "GET") {
      const auth = requireRoles(requireAuth(req), ["teacher", "admin"]);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      const list = loadAssignments().assignments.filter(
        (a) => normalizeRole(auth.user.role) === "admin" || a.teacherId === auth.user.id,
      );
      return sendJson(res, 200, { assignments: list });
    }

    if (requestPath === "/auth/teacher/assignments" && req.method === "POST") {
      const auth = requireRoles(requireAuth(req), ["teacher"]);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      const body = await readRequestBody(req);
      const result = createAssignment(auth.user, body);
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { assignment: result.assignment });
    }

    const adminRoleMatch = requestPath.match(/^\/auth\/admin\/users\/([^/]+)\/role$/);
    if (adminRoleMatch && req.method === "PATCH") {
      const auth = requireRoles(requireAuth(req), ["admin"]);
      if (auth.error) return sendJson(res, auth.status, { error: auth.error });
      const body = await readRequestBody(req);
      const result = updateUserRole(auth.user, adminRoleMatch[1], normalizeRole(body.role));
      if (result.error) return sendJson(res, result.status, { error: result.error });
      return sendJson(res, result.status, { user: result.user });
    }

    sendJson(res, 404, { error: "Not Found" });
  } catch (err) {
    if (err.message === "Invalid JSON") {
      return sendJson(res, 400, { error: "请求体不是有效 JSON" });
    }
    if (err.message === "Request body too large") {
      return sendJson(res, 413, { error: "请求体过大" });
    }
    console.error("[AuthError]", err);
    sendJson(res, 500, { error: "服务器错误" });
  }
}

function migrateUserRoles() {
  const data = loadUsers();
  let changed = false;
  for (const user of data.users) {
    const normalized = normalizeRole(user.role);
    if (user.role !== normalized) {
      user.role = normalized;
      changed = true;
    }
  }
  if (changed) saveUsers(data);
}

function ensureUniqueAdmin() {
  if (!fs.existsSync(USERS_SEED_FILE)) return;

  const seed = readJsonFile(USERS_SEED_FILE, { users: [] });
  const adminSeed = (seed.users || []).find(
    (item) => normalizeRole(item.role) === "admin",
  );
  if (!adminSeed) return;

  const data = loadUsers();
  let changed = false;
  const adminNameLower = ADMIN_USERNAME.toLowerCase();

  for (const user of data.users) {
    if (user.role === "admin" && user.username.toLowerCase() !== adminNameLower) {
      user.role = DEFAULT_ROLE;
      changed = true;
    }
  }

  let adminUser = data.users.find((u) => u.username.toLowerCase() === adminNameLower);
  if (!adminUser) {
    adminUser = {
      id: crypto.randomUUID(),
      username: adminSeed.username,
      displayName: adminSeed.displayName || adminSeed.username,
      role: "admin",
      password: createPasswordRecord(adminSeed.password),
      createdAt: Date.now(),
    };
    data.users.push(adminUser);
    changed = true;
    console.log(`[Auth] 已创建唯一管理员账号: ${ADMIN_USERNAME}`);
  } else if (adminUser.role !== "admin") {
    adminUser.role = "admin";
    changed = true;
  }

  if (changed) saveUsers(data);
}

function initAuth() {
  ensureDataDirs();
  seedFromEvalIfNeeded();
  loadUsers();
  migrateUserRoles();
  ensureUniqueAdmin();
  loadSessions();
}

function deleteUserByUsername(username) {
  const data = loadUsers();
  const idx = data.users.findIndex((u) => u.username === username);
  if (idx === -1) return false;
  const [removed] = data.users.splice(idx, 1);
  saveUsers(data);
  const userDataPath = getUserDataPath(removed.id);
  if (fs.existsSync(userDataPath)) fs.unlinkSync(userDataPath);
  return true;
}

module.exports = {
  initAuth,
  handleAuthRequest,
  deleteUserByUsername,
  USER_ROLES,
  REGISTERABLE_ROLES,
  ROLE_LABELS,
  ADMIN_USERNAME,
};
