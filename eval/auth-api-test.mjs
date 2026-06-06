/**
 * 登录/注册 API 自动化测试
 * 运行：先 node server.js，再 node eval/auth-api-test.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesFile = path.join(__dirname, "auth-test-cases.json");
const { baseUrl, cases } = JSON.parse(fs.readFileSync(casesFile, "utf8"));

let passed = 0;
let failed = 0;

async function request(method, urlPath, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

function hasPath(obj, dotPath) {
  return dotPath.split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), obj) != null;
}

async function runCase(testCase) {
  const { id, method, path: urlPath, body, expectStatus, expectFields = [] } = testCase;
  const { status, data } = await request(method, urlPath, body);
  let ok = status === expectStatus;
  for (const field of expectFields) {
    if (!hasPath(data, field)) ok = false;
  }

  if (ok) {
    console.log(`✅ ${id}`);
    passed++;
  } else {
    console.log(`❌ ${id} — 期望 ${expectStatus}，实际 ${status}`, data);
    failed++;
  }

  if (testCase.cleanup?.username && status === 201) {
    // 注册测试产生的用户需手动清理；服务端未暴露删除 API，跳过
  }

  return data;
}

console.log(`=== Auth API 测试 (${baseUrl}) ===\n`);

for (const testCase of cases) {
  await runCase(testCase);
}

const loginResult = await request("POST", "/auth/login", { username: "demo", password: "demo123" });
if (loginResult.status === 200 && loginResult.data.token) {
  const me = await request("GET", "/auth/me", null, loginResult.data.token);
  if (me.status === 200 && me.data.user?.username === "demo") {
    console.log("✅ me_with_token");
    passed++;
  } else {
    console.log("❌ me_with_token", me);
    failed++;
  }

  if (me.status === 200 && me.data.user?.role === "student") {
    console.log("✅ me_has_role");
    passed++;
  } else {
    console.log("❌ me_has_role", me);
    failed++;
  }

  const userData = await request("GET", "/auth/data", null, loginResult.data.token);
  if (userData.status === 200 && userData.data.data) {
    console.log("✅ get_user_data");
    passed++;
  } else {
    console.log("❌ get_user_data", userData);
    failed++;
  }
} else {
  console.log("❌ me_with_token — 无法获取 demo token");
  failed += 2;
}

console.log(`\n--- 结果: ${passed} 通过, ${failed} 失败 ---`);
process.exit(failed > 0 ? 1 : 0);
