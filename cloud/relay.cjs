// Runs inside GitHub Actions (.github/workflows/xepher-run.yml): does one Xepher
// command on a project repo with Claude Code, and keeps a comment on the
// "Xepher log" issue updated so the phone can show live status and the reply.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runJob } = require("../desktop/runner.cjs");

const { GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID, GH_TOKEN, XEPHER_GH_TOKEN, PROMPT, JOB_ID, PROJECT } = process.env;
const RUN_URL = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
// Lives inside the cached ~/.claude/projects, so the conversation carries over between runs.
const SESSION_FILE = path.join(os.homedir(), ".claude", "projects", "xepher-session.txt");

const scrub = (s) => (XEPHER_GH_TOKEN ? String(s).split(XEPHER_GH_TOKEN).join("***") : String(s));

async function gh(method, url, body) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function logIssue() {
  const issues = await gh("GET", `/repos/${GITHUB_REPOSITORY}/issues?state=all&per_page=100`);
  const found = issues.find((i) => i.title === "Xepher log" && !i.pull_request);
  if (found) return found.number;
  const made = await gh("POST", `/repos/${GITHUB_REPOSITORY}/issues`, {
    title: "Xepher log",
    body: "Xepher posts each cloud command's status and reply here. The app reads them; you can ignore this issue.",
  });
  return made.number;
}

async function main() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(PROJECT || "")) throw new Error(`Bad project name: ${PROJECT}`);
  const issue = await logIssue();
  const head = (state) => `<!-- xepher:${JOB_ID} ${state} -->\n`;
  const comment = await gh("POST", `/repos/${GITHUB_REPOSITORY}/issues/${issue}/comments`, {
    body: `${head("working")}Starting Claude on ${PROJECT}…`,
  });
  const update = (state, text) => gh("PATCH", `/repos/${GITHUB_REPOSITORY}/issues/comments/${comment.id}`, { body: head(state) + scrub(text) });

  // Status updates at most every 4 s, so a busy run doesn't hammer the API.
  let last = 0;
  let pending = null;
  const emit = (e) => {
    if (e.type !== "status") return;
    console.log(e.text);
    pending = e.text;
    if (Date.now() - last > 4000) {
      last = Date.now();
      update("working", pending).catch((err) => console.log(err.message));
    }
  };

  try {
    const sessionId = fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, "utf8").trim() : undefined;
    const { reply, sessionId: next } = await runJob(
      { repo: PROJECT, cloneUrl: `https://github.com/${PROJECT}.git`, prompt: PROMPT, sessionId, fullAccess: true },
      emit,
      { projectsDir: path.join(process.env.GITHUB_WORKSPACE, "projects") },
    );
    if (next) {
      fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
      fs.writeFileSync(SESSION_FILE, next);
    }
    if (reply.includes("not on GitHub yet")) throw new Error(reply);
    await update("done", reply);
  } catch (e) {
    await update("error", `${e.message}\n\nRun: ${RUN_URL}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(scrub(e.message));
  process.exit(1);
});
