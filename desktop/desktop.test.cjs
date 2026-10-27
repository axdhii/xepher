const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const hooks = require("./hooks.cjs");
const { readStreamLine, hookStatus } = require("./claude-events.cjs");

test("hooks merge keeps existing settings and is idempotent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xepher-"));
  const file = path.join(dir, "settings.json");
  const mine = { model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } };
  fs.writeFileSync(file, JSON.stringify(mine));
  hooks.install(file);
  hooks.install(file);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(after.model, "opus");
  assert.equal(after.hooks.Stop.length, 2);
  assert.equal(after.hooks.Stop[0].hooks[0].command, "say done");
  assert.equal(after.hooks.PreToolUse.length, 1);
  assert.ok(hooks.installed(after));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.before-xepher`, "utf8")), mine);
});

test("hooks install refuses to overwrite a broken settings file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xepher-"));
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, "{ not json");
  assert.throws(() => hooks.install(file));
  assert.equal(fs.readFileSync(file, "utf8"), "{ not json");
});

test("stream-json lines", () => {
  const tool = { type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "C:\\x\\src\\App.tsx" } }] } };
  assert.deepEqual(readStreamLine(JSON.stringify(tool)), { status: "Editing App.tsx" });
  const res = { type: "result", result: "Added it.", session_id: "abc", is_error: false };
  assert.deepEqual(readStreamLine(JSON.stringify(res)), { result: "Added it.", sessionId: "abc", isError: false });
  assert.equal(readStreamLine("not json"), null);
  assert.equal(readStreamLine('{"type":"system"}'), null);
});

test("hook events", () => {
  assert.deepEqual(hookStatus({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } }), {
    busy: true,
    text: "Claude Code: Running: npm test",
  });
  assert.equal(hookStatus({ hook_event_name: "Stop" }).busy, false);
  assert.equal(hookStatus({ hook_event_name: "Other" }), null);
});
