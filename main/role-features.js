const WORKSPACE_TITLES = {
  student: "🎓 学生学习中心",
  parent: "👪 家长监护台",
  teacher: "👨‍🏫 教师工作台",
  admin: "🛡️ 管理后台",
};

const WORKSPACE_NAV_LABELS = {
  student: "🎓 学习中心",
  parent: "👪 家长监护",
  teacher: "👨‍🏫 教师台",
  admin: "🛡️ 管理后台",
};

async function fetchDashboard() {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch("/auth/dashboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function readLocalStudentStats() {
  const parse = (key, fb) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb)); } catch { return fb; }
  };
  const stats = parse("dls-ai-progress-stats", {});
  const checkin = parse("dls-ai-checkin", {});
  return {
    xp: parseInt(localStorage.getItem("dls-ai-xp") || "0", 10),
    quizCount: parse("dls-ai-quiz-scores", []).length,
    favoritesCount: parse("dls-ai-favorites", []).length,
    wordbookCount: parse("dls-ai-wordbook", []).length,
    phrasesLearned: stats.phrasesLearned || 0,
    audioPlayed: stats.audioPlayed || 0,
    checkinStreak: checkin.streak || 0,
  };
}

function statCard(label, value, hint) {
  return `<div class="ws-stat-card"><div class="ws-stat-label">${label}</div><div class="ws-stat-value">${value}</div>${hint ? `<div class="ws-stat-hint">${hint}</div>` : ""}</div>`;
}

function renderStudentPanel(data) {
  const stats = { ...data.stats, ...readLocalStudentStats() };
  const assignments = data.assignments || [];
  return `
    <div class="ws-section">
      <h3>📊 我的学习数据</h3>
      <div class="ws-stat-grid">
        ${statCard("经验值", stats.xp, "XP")}
        ${statCard("连续打卡", `${stats.checkinStreak} 天`)}
        ${statCard("完成测验", `${stats.quizCount} 次`)}
        ${statCard("生词本", `${stats.wordbookCount} 词`)}
        ${statCard("已学短语", `${stats.phrasesLearned} 条`)}
        ${statCard("播放发音", `${stats.audioPlayed} 次`)}
      </div>
    </div>
    <div class="ws-section">
      <h3>⚡ 快捷学习</h3>
      <div class="ws-actions">
        <button type="button" class="btn ws-action-btn" data-go="quiz">🎯 开始测验</button>
        <button type="button" class="btn ws-action-btn" data-go="dictionary">📖 查词典</button>
        <button type="button" class="btn ws-action-btn" data-go="wordbook">📕 生词本</button>
        <button type="button" class="btn ws-action-btn" data-go="daily">📅 每日一句</button>
        <button type="button" class="btn ws-action-btn" data-go="chat">💬 AI 对话</button>
      </div>
    </div>
    ${assignments.length ? `
    <div class="ws-section">
      <h3>📋 老师布置的练习</h3>
      <div class="ws-list">${assignments.map((a) => `
        <div class="ws-list-item">
          <strong>${escapeHtml(a.title)}</strong>
          <span class="ws-muted">${escapeHtml(a.teacherName || "老师")} · ${formatDate(a.createdAt)}</span>
          ${a.content ? `<p>${escapeHtml(a.content)}</p>` : ""}
        </div>`).join("")}</div>
    </div>` : ""}
  `;
}

function renderParentPanel(data) {
  const linked = data.linkedStudentUsername || "demo";
  const child = (data.students || []).find((s) => s.username === linked) || (data.students || [])[0];
  const stats = child?.stats || {};
  return `
    <div class="ws-section">
      <h3>👀 孩子学习监督</h3>
      ${child ? `
        <p>当前关注：<strong>${escapeHtml(child.displayName)}</strong>（@${escapeHtml(child.username)}）</p>
        <div class="ws-stat-grid">
          ${statCard("经验值", stats.xp || 0)}
          ${statCard("连续打卡", `${stats.checkinStreak || 0} 天`)}
          ${statCard("完成测验", `${stats.quizCount || 0} 次`)}
          ${statCard("生词本", `${stats.wordbookCount || 0} 词`)}
        </div>` : `<p class="ws-muted">暂无学生数据，请关联学生账号。</p>`}
    </div>
    <div class="ws-section">
      <h3>⚙️ 监护设置</h3>
      <form id="parentSettingsForm" class="ws-form">
        <label>关联学生账号<input id="parentLinkedStudent" value="${escapeHtml(linked)}" placeholder="demo" /></label>
        <label>本周学习目标<input id="parentWeeklyGoal" value="${escapeHtml(data.weeklyGoal || "")}" placeholder="例如：完成 3 次测验" /></label>
        <label>鼓励语<textarea id="parentNote" rows="3" placeholder="给孩子一句鼓励">${escapeHtml(data.parentNote || "")}</textarea></label>
        <button type="submit" class="btn">保存设置</button>
      </form>
    </div>
    <div class="ws-section">
      <h3>💡 亲子共学建议</h3>
      <ul class="ws-tips">${(data.tips || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>
    <div class="ws-section">
      <h3>📈 全部学生概览</h3>
      <div class="ws-table-wrap"><table class="ws-table">
        <thead><tr><th>学生</th><th>XP</th><th>测验</th><th>打卡</th></tr></thead>
        <tbody>${(data.students || []).map((s) => `<tr>
          <td>${escapeHtml(s.displayName)}</td>
          <td>${s.stats?.xp || 0}</td>
          <td>${s.stats?.quizCount || 0}</td>
          <td>${s.stats?.checkinStreak || 0} 天</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  `;
}

function renderTeacherPanel(data) {
  const students = data.students || [];
  const assignments = data.assignments || [];
  return `
    <div class="ws-section">
      <h3>⚡ 教学快捷操作</h3>
      <div class="ws-actions">
        <button type="button" class="btn ws-action-btn" data-go="quiz">🎯 AI 出题 / 测验</button>
        <button type="button" class="btn ws-action-btn" data-go="phrases">📝 常用短语教案</button>
        <button type="button" class="btn ws-action-btn" data-go="dictionary">📖 词典备课</button>
        <button type="button" class="btn ws-action-btn" data-go="chat">💬 AI 教学对话</button>
      </div>
    </div>
    <div class="ws-section">
      <h3>📋 布置练习</h3>
      <form id="teacherAssignmentForm" class="ws-form">
        <label>练习标题<input id="assignmentTitle" placeholder="例如：本周粤拼复习" required /></label>
        <label>练习说明<textarea id="assignmentContent" rows="3" placeholder="完成声调练习并提交测验"></textarea></label>
        <label>布置对象
          <select id="assignmentTarget">
            <option value="all">全部学生</option>
            ${students.map((s) => `<option value="${s.id}">${escapeHtml(s.displayName)}</option>`).join("")}
          </select>
        </label>
        <button type="submit" class="btn">发布练习</button>
      </form>
    </div>
    ${assignments.length ? `
    <div class="ws-section">
      <h3>📌 已发布练习</h3>
      <div class="ws-list">${assignments.map((a) => `
        <div class="ws-list-item">
          <strong>${escapeHtml(a.title)}</strong>
          <span class="ws-muted">${a.target === "all" ? "全部学生" : "指定学生"} · ${formatDate(a.createdAt)}</span>
          ${a.content ? `<p>${escapeHtml(a.content)}</p>` : ""}
        </div>`).join("")}</div>
    </div>` : ""}
    <div class="ws-section">
      <h3>👨‍🎓 学生学情</h3>
      <div class="ws-table-wrap"><table class="ws-table">
        <thead><tr><th>学生</th><th>XP</th><th>测验</th><th>生词</th><th>发音练习</th></tr></thead>
        <tbody>${students.map((s) => `<tr>
          <td>${escapeHtml(s.displayName)}<br><span class="ws-muted">@${escapeHtml(s.username)}</span></td>
          <td>${s.stats?.xp || 0}</td>
          <td>${s.stats?.quizCount || 0}</td>
          <td>${s.stats?.wordbookCount || 0}</td>
          <td>${s.stats?.audioPlayed || 0}</td>
        </tr>`).join("") || `<tr><td colspan="5">暂无学生账号</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
}

function renderAdminPanel(data) {
  const { counts, users } = data;
  return `
    <div class="ws-section">
      <h3>📊 系统概览</h3>
      <div class="ws-stat-grid">
        ${statCard("总用户", counts?.total || 0)}
        ${statCard("学生", counts?.byRole?.student || 0)}
        ${statCard("家长", counts?.byRole?.parent || 0)}
        ${statCard("老师", counts?.byRole?.teacher || 0)}
        ${statCard("管理员", counts?.byRole?.admin || 0)}
      </div>
    </div>
    <div class="ws-section">
      <h3>👥 用户管理</h3>
      <div class="ws-table-wrap"><table class="ws-table">
        <thead><tr><th>用户</th><th>身份</th><th>XP</th><th>测验</th><th>操作</th></tr></thead>
        <tbody>${(users || []).map((u) => `<tr>
          <td>${escapeHtml(u.displayName)}<br><span class="ws-muted">@${escapeHtml(u.username)}</span></td>
          <td><span class="nav-role-badge" data-role="${u.role}">${escapeHtml(u.roleLabel)}</span></td>
          <td>${u.stats?.xp || 0}</td>
          <td>${u.stats?.quizCount || 0}</td>
          <td>${u.role === "admin" ? "—" : `
            <select class="ws-role-select" data-user-id="${u.id}">
              <option value="student" ${u.role === "student" ? "selected" : ""}>学生</option>
              <option value="parent" ${u.role === "parent" ? "selected" : ""}>家长</option>
              <option value="teacher" ${u.role === "teacher" ? "selected" : ""}>老师</option>
            </select>`}
          </td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="ws-section">
      <h3>⚙️ 管理快捷入口</h3>
      <div class="ws-actions">
        <button type="button" class="btn ws-action-btn" data-go="settings">⚙️ 系统设置</button>
        <button type="button" class="btn secondary ws-action-btn" id="wsRefreshAdmin">🔄 刷新数据</button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("zh-CN");
}

function bindWorkspaceActions(container) {
  container.querySelectorAll(".ws-action-btn[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.go));
  });

  container.querySelector("#parentSettingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      linkedStudentUsername: document.getElementById("parentLinkedStudent")?.value.trim(),
      weeklyGoal: document.getElementById("parentWeeklyGoal")?.value.trim(),
      parentNote: document.getElementById("parentNote")?.value.trim(),
    };
    const { ok, data } = await authRequest("/auth/parent/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (ok) {
      showPixelToast?.("✅ 监护设置已保存");
      renderRoleWorkspace();
    } else {
      alert(data.error || "保存失败");
    }
  });

  container.querySelector("#teacherAssignmentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const targetVal = document.getElementById("assignmentTarget")?.value;
    const body = {
      title: document.getElementById("assignmentTitle")?.value.trim(),
      content: document.getElementById("assignmentContent")?.value.trim(),
      target: targetVal === "all" ? "all" : undefined,
      targetStudentId: targetVal === "all" ? undefined : targetVal,
    };
    const { ok, data } = await authRequest("/auth/teacher/assignments", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (ok) {
      showPixelToast?.("✅ 练习已发布");
      renderRoleWorkspace();
    } else {
      alert(data.error || "发布失败");
    }
  });

  container.querySelectorAll(".ws-role-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const userId = sel.dataset.userId;
      const role = sel.value;
      const { ok, data } = await authRequest(`/auth/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (ok) {
        showPixelToast?.("✅ 角色已更新");
        renderRoleWorkspace();
      } else {
        alert(data.error || "更新失败");
        renderRoleWorkspace();
      }
    });
  });

  container.querySelector("#wsRefreshAdmin")?.addEventListener("click", renderRoleWorkspace);
}

async function renderRoleWorkspace() {
  const root = document.getElementById("roleWorkspaceContent");
  const titleEl = document.getElementById("roleWorkspaceTitle");
  if (!root) return;

  const user = getCurrentUser();
  if (!user) {
    root.innerHTML = `<p class="ws-muted">请先 <a href="#" data-go="auth">登录</a> 后使用专属工作台。</p>`;
    root.querySelector("[data-go=auth]")?.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo("auth");
    });
    return;
  }

  const role = user.role || "student";
  if (titleEl) titleEl.textContent = WORKSPACE_TITLES[role] || "工作台";

  root.innerHTML = `<p class="ws-loading">加载中…</p>`;
  const data = await fetchDashboard();
  if (!data) {
    root.innerHTML = `<p class="ws-muted">加载失败，请确认已登录且服务正常运行。</p>`;
    return;
  }

  let html = "";
  if (role === "student") html = renderStudentPanel(data);
  else if (role === "parent") html = renderParentPanel(data);
  else if (role === "teacher") html = renderTeacherPanel(data);
  else if (role === "admin") html = renderAdminPanel(data);
  else html = `<p class="ws-muted">未知身份</p>`;

  root.innerHTML = html;
  bindWorkspaceActions(root);
}

function updateWorkspaceNav() {
  const item = document.getElementById("navWorkspaceItem");
  const btn = document.getElementById("navWorkspaceBtn");
  const user = getCurrentUser();
  if (!item || !btn) return;
  if (user?.role) {
    item.hidden = false;
    btn.textContent = WORKSPACE_NAV_LABELS[user.role] || "工作台";
  } else {
    item.hidden = true;
  }
}

function initRoleFeatures() {
  updateWorkspaceNav();
  const origUpdateNav = window.updateNavAuthUI;
  window.updateNavAuthUI = function () {
    origUpdateNav?.();
    updateWorkspaceNav();
  };

  const origNavigate = window.navigateTo;
  if (origNavigate) {
    window.navigateTo = function (pageName) {
      origNavigate(pageName);
      if (pageName === "workspace") renderRoleWorkspace();
    };
  }

  if (document.getElementById("page-workspace")?.classList.contains("active")) {
    renderRoleWorkspace();
  }
}

window.renderRoleWorkspace = renderRoleWorkspace;
document.addEventListener("DOMContentLoaded", initRoleFeatures);
