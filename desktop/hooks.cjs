// Adds Xepher's status hooks to Claude Code's user settings (~/.claude/settings.json)
// without touching anything else in that file.

const fs = require("fs");
const path = require("path");

const PORT = 47321;
const MARK = "/hook?xepher";
// `exit 0` so Claude Code never reports an error while Xepher isn't running.
const COMMAND = `curl -s -m 1 --data-binary @- http://127.0.0.1:${PORT}${MARK}; exit 0`;
const EVENTS = ["UserPromptSubmit", "PreToolUse", "Notification", "Stop"];

const hasOurs = (groups) => (groups || []).some((g) => (g.hooks || []).some((h) => String(h.command).includes(MARK)));

function withHooks(settings) {
  const out = { ...settings, hooks: { ...(settings.hooks || {}) } };
  for (const ev of EVENTS) {
    if (hasOurs(out.hooks[ev])) continue;
    out.hooks[ev] = [...(out.hooks[ev] || []), { hooks: [{ type: "command", command: COMMAND }] }];
  }
  return out;
}

const installed = (settings) => EVENTS.every((ev) => hasOurs(settings.hooks?.[ev]));

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")); // throws on a broken file rather than overwrite it
}

function install(file) {
  const current = readSettings(file);
  if (installed(current)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.before-xepher`);
  fs.writeFileSync(file, JSON.stringify(withHooks(current), null, 2));
}

module.exports = { PORT, MARK, withHooks, installed, readSettings, install };
