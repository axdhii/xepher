// Runs one Xepher command on this laptop: make sure the project is cloned and
// current, run Claude Code in it, then commit and push so GitHub has the change.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { readStreamLine } = require("./claude-events.cjs");

const isWin = process.platform === "win32";

// Spoken replies should be short, and Xepher does the git work afterwards.
const PREAMBLE =
  "[Sent through Xepher, a voice assistant. Do the task fully in this repo. Don't commit or push and don't mention git: " +
  "Xepher commits and pushes your changes automatically when you finish. End with a 1-3 sentence summary in plain words, because it is read aloud.]\n\n";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // claude/git may be .cmd shims on Windows, which need a shell. Args are fixed tokens, never user text.
    const p = spawn(cmd, args, { shell: isWin, windowsHide: true, ...opts });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    if (opts.input !== undefined) p.stdin.end(opts.input);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args[0]} failed: ${(err || out).trim().slice(-400)}`))));
  });
}

// stdout chunks can split a JSON line; buffer until newline.
function lineSplitter(onLine) {
  let buf = "";
  return (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop();
    lines.forEach((l) => l.trim() && onLine(l));
  };
}

function claude(dir, prompt, sessionId, fullAccess, emit, claudeCmd) {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", fullAccess ? "bypassPermissions" : "acceptEdits"];
  if (sessionId) args.push("--resume", sessionId);
  return new Promise((resolve, reject) => {
    const p = spawn(claudeCmd, args, { cwd: dir, shell: isWin, windowsHide: true });
    let result = null;
    let err = "";
    p.stdout.on(
      "data",
      lineSplitter((l) => {
        const r = readStreamLine(l);
        if (r?.status) emit({ type: "status", text: r.status });
        if (r && "result" in r) result = r;
      }),
    );
    p.stderr.on("data", (d) => (err += d));
    p.stdin.end(PREAMBLE + prompt);
    p.on("error", reject);
    p.on("close", (code) => {
      if (result && !result.isError) resolve(result);
      else reject(new Error(result?.result || err.trim().slice(-400) || `Claude Code exited with ${code}`));
    });
  });
}

async function runJob(job, emit, { projectsDir, claudeCmd = "claude" }) {
  if (job.sessionId && !/^[0-9a-f-]{36}$/i.test(job.sessionId)) job.sessionId = undefined;
  const name = job.repo.split("/")[1];
  const dir = path.join(projectsDir, name);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    emit({ type: "status", text: `Cloning ${name}…` });
    fs.mkdirSync(projectsDir, { recursive: true });
    await run("git", ["clone", job.cloneUrl, dir]);
  } else {
    emit({ type: "status", text: "Pulling the latest changes…" });
    // The cloud may have pushed while the laptop was off. A failed pull isn't fatal; Claude still runs.
    await run("git", ["pull", "--ff-only"], { cwd: dir }).catch((e) => emit({ type: "status", text: `Couldn't pull: ${e.message}` }));
  }

  emit({ type: "status", text: "Claude is thinking…" });
  let result;
  try {
    result = await claude(dir, job.prompt, job.sessionId, job.fullAccess, emit, claudeCmd);
  } catch (e) {
    if (!job.sessionId) throw e;
    // The saved conversation may be gone (cleared, other machine): start a fresh one.
    result = await claude(dir, job.prompt, undefined, job.fullAccess, emit, claudeCmd);
  }

  let note = "";
  try {
    if ((await run("git", ["status", "--porcelain"], { cwd: dir })).trim()) {
      emit({ type: "status", text: "Committing…" });
      await run("git", ["add", "-A"], { cwd: dir });
      await run("git", ["commit", "-q", "-F", "-"], { cwd: dir, input: `Xepher: ${job.prompt.slice(0, 72)}\n\n${job.prompt}` });
    }
    emit({ type: "status", text: "Pushing to GitHub…" });
    await run("git", ["push", "-q"], { cwd: dir });
  } catch (e) {
    note = `\n\n(Changes are saved in ${dir} but not on GitHub yet: ${e.message})`;
  }
  return { reply: result.result + note, sessionId: result.sessionId };
}

module.exports = { runJob };
