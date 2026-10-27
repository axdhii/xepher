// Turns what Aadhil types or says into an action. Pure, so it can be unit tested.

export type Action =
  | { kind: "switch"; name: string }
  | { kind: "create"; name: string }
  | { kind: "add"; name: string }
  | { kind: "link"; url?: string }
  | { kind: "projects" }
  | { kind: "ask"; prompt: string };

const clean = (s: string) => s.trim().replace(/[.!?]+$/, "").trim();

export function parse(input: string): Action {
  const text = clean(input);
  const lower = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(?:set|save)\s+(?:the\s+)?(?:claude\s+)?link\s+(?:to\s+)?(https:\/\/\S+)$/i))) return { kind: "link", url: m[1] };
  if (/^(?:open|show)\s+(?:the\s+)?(?:claude|chat|claude chat|link|claude link|project link)$/.test(lower)) return { kind: "link" };
  if (/^(?:list|show|open)\s+(?:my\s+|all\s+|the\s+)?projects$/.test(lower)) return { kind: "projects" };
  if ((m = text.match(/^(?:create|make|start|new)\s+(?:a\s+)?(?:new\s+)?(?:project|repo|repository)\s+(?:called\s+|named\s+)?(.+)$/i)))
    return { kind: "create", name: m[1] };
  if ((m = text.match(/^add\s+(?:the\s+)?(?:existing\s+)?(?:project|repo|repository)\s+(.+)$/i))) return { kind: "add", name: m[1] };
  if ((m = text.match(/^(?:open|switch\s+to|go\s+to|use)\s+(?:the\s+)?(?:project\s+)?(.+?)(?:\s+project)?$/i))) return { kind: "switch", name: m[1] };
  return { kind: "ask", prompt: input.trim() };
}

// "My Cool App" -> "my-cool-app": a valid GitHub repo name.
export function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
}

// Speech gives "my cool app" for a repo called "my-cool-app" or "MyCoolApp":
// compare letters and digits only, then fall back to "starts with" / "contains".
export function findProject<T extends { name: string }>(projects: T[], spoken: string): T | undefined {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const k = key(spoken);
  if (!k) return undefined;
  return (
    projects.find((p) => key(p.name) === k) ??
    projects.find((p) => key(p.name).startsWith(k)) ??
    projects.find((p) => key(p.name).includes(k))
  );
}
