// Turns Claude Code's output (stream-json lines and hook events) into short
// status lines for the robot. Shared by the Windows app and the cloud runner.

const base = (p) => String(p || "").split(/[\\/]/).pop();

function describe(name, input = {}) {
  switch (name) {
    case "Read": return `Reading ${base(input.file_path)}`;
    case "Edit":
    case "MultiEdit": return `Editing ${base(input.file_path)}`;
    case "Write": return `Writing ${base(input.file_path)}`;
    case "NotebookEdit": return `Editing ${base(input.notebook_path)}`;
    case "Bash": return `Running: ${String(input.description || input.command || "").slice(0, 70)}`;
    case "Grep": return `Searching for "${input.pattern}"`;
    case "Glob": return `Looking for ${input.pattern}`;
    case "WebFetch": return `Reading ${input.url}`;
    case "WebSearch": return `Searching the web: ${input.query}`;
    case "Task":
    case "Agent": return `Delegating: ${input.description || "a subtask"}`;
    case "TodoWrite": return "Planning the steps";
    default: return `Using ${name}`;
  }
}

// One line of `claude -p --output-format stream-json --verbose`.
// Returns { status } while it works, { result, sessionId, isError } at the end, or null.
function readStreamLine(line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return null;
  }
  if (e.type === "assistant" && Array.isArray(e.message?.content)) {
    const tool = e.message.content.filter((c) => c.type === "tool_use").pop();
    if (tool) return { status: describe(tool.name, tool.input) };
    if (e.message.content.some((c) => c.type === "text")) return { status: "Writing the answer" };
  }
  if (e.type === "result") return { result: String(e.result ?? ""), sessionId: e.session_id, isError: !!e.is_error };
  return null;
}

// A hook event (JSON on the hook's stdin) -> what the robot should show.
function hookStatus(e) {
  switch (e.hook_event_name) {
    case "UserPromptSubmit": return { busy: true, text: "Claude Code: thinking" };
    case "PreToolUse": return { busy: true, text: `Claude Code: ${describe(e.tool_name, e.tool_input)}` };
    case "Notification": return { busy: false, text: `Claude Code needs you: ${e.message || ""}` };
    case "Stop":
    case "SessionEnd": return { busy: false, text: "" };
    default: return null;
  }
}

module.exports = { describe, readStreamLine, hookStatus };
