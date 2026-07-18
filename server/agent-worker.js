const { parentPort, workerData } = require("worker_threads");

function runCoordinator(context, skill) {
  const intent = context.mode === "auto"
    ? (/测验|练习|出题/.test(context.task) ? "practice" : /查|词典|意思|读音/.test(context.task) ? "dictionary" : "translation")
    : context.mode;
  return {
    agent: "learning-coordinator",
    skill: skill?.name || "learning-coordinator",
    intent,
    steps: intent === "practice"
      ? ["确认学习目标", "基于词典生成练习", "给出复习建议"]
      : ["确认方言与任务", "检索可靠词典资料", "整理可学习的结果"],
  };
}

function runSafetyReviewer(context, skill) {
  const blocked = /(ignore\s+(all\s+)?(previous\s+)?instructions|jailbreak|\bDAN\b|忽略.*(规则|指令|系统)|绕过.*(安全|审核)|如何\s*(制作|制造).*(炸弹|毒品|武器)|自杀\s*方法)/i;
  const matched = blocked.test(context.task);
  return {
    agent: "safety-reviewer",
    skill: skill?.name || "safety-reviewer",
    allowed: !matched,
    message: matched ? "协同任务包含不安全或越权指令。" : "",
    violations: matched ? [{ id: "worker_safety", severity: "block" }] : [],
  };
}

const { agent, context, skill } = workerData;
const result = agent === "learning-coordinator"
  ? runCoordinator(context, skill)
  : runSafetyReviewer(context, skill);
parentPort.postMessage(result);
