// GitHub, called straight from the device with Aadhil's own token.
// A Xepher project is any repo of his tagged with the "xepher" topic, so the
// list is the same on Windows and Android with nothing to sync.

export type Project = {
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  homepage: string | null; // the project's claude.ai link, if set
};

export const TOPIC = "xepher";
export const RUN_WORKFLOW = "xepher-run.yml";

let token = "";
export const setToken = (t: string) => (token = t.trim());

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new Error("Add your GitHub token in settings first.");
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.errors?.map((e: any) => e.message).filter(Boolean).join(", ");
    throw new Error(`GitHub: ${body.message ?? res.statusText}${detail ? ` (${detail})` : ""}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const me = () => api<{ login: string }>("/user").then((u) => u.login);

const pick = (r: any): Project => ({
  name: r.name,
  full_name: r.full_name,
  html_url: r.html_url,
  clone_url: r.clone_url,
  homepage: r.homepage || null,
});

export async function listProjects(): Promise<Project[]> {
  // shortcut: first 300 repos by last push, enough for one person; page further if that ever runs out
  const all: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api<any[]>(`/user/repos?per_page=100&sort=pushed&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((r) => r.topics?.includes(TOPIC)).map(pick);
}

async function tag(fullName: string) {
  const { names } = await api<{ names: string[] }>(`/repos/${fullName}/topics`);
  if (!names.includes(TOPIC)) await api(`/repos/${fullName}/topics`, { method: "PUT", body: JSON.stringify({ names: [...names, TOPIC] }) });
}

// Creates a private repo with a first commit, so the cloud runner can push to it right away.
export async function createProject(name: string): Promise<Project> {
  const repo = await api("/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, private: true, auto_init: true, description: "Made with Xepher" }),
  });
  await tag(repo.full_name);
  return pick(repo);
}

// Brings an existing repo into Xepher.
export async function addProject(owner: string, name: string): Promise<Project> {
  const repo = await api(`/repos/${owner}/${name}`);
  await tag(repo.full_name);
  return pick(repo);
}

export const setLink = (fullName: string, url: string) =>
  api(`/repos/${fullName}`, { method: "PATCH", body: JSON.stringify({ homepage: url }) });

// The comment the cloud runner keeps updated: a marker line, then status or the reply.
export type CloudUpdate = { state: "working" | "done" | "error"; text: string; url?: string };

export function readMarker(body: string, id: string): CloudUpdate | null {
  const m = body.match(/^<!-- xepher:(\S+) (working|done|error) -->\n?([\s\S]*)$/);
  if (!m || m[1] !== id) return null;
  return { state: m[2] as CloudUpdate["state"], text: m[3].trim() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs a command in the cloud: the runner repo's workflow checks out the project,
// runs Claude Code with Aadhil's subscription token, and pushes. Works with the laptop off.
export async function runCloud(runner: string, project: Project, prompt: string, onStatus: (s: string) => void): Promise<string> {
  const id = Math.random().toString(36).slice(2, 10);
  await api(`/repos/${runner}/actions/workflows/${RUN_WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { repo: project.full_name, prompt, id } }),
  });
  onStatus("Waiting for a cloud runner…");
  const started = Date.now();
  let runUrl = "";
  for (let i = 0; Date.now() - started < 65 * 60_000; i++) {
    await sleep(5000);
    const comments = await api<any[]>(`/repos/${runner}/issues/comments?sort=updated&direction=desc&per_page=30`);
    const update = comments.map((c) => readMarker(c.body, id)).find(Boolean);
    if (update?.state === "done") return update.text;
    if (update?.state === "error") throw new Error(update.text);
    if (update) onStatus(update.text);
    // Every 30 s, check the run itself: it can fail before it ever comments.
    if (i % 6 === 0) {
      const { workflow_runs } = await api(`/repos/${runner}/actions/runs?event=workflow_dispatch&per_page=20`);
      const run = workflow_runs.find((r: any) => r.display_title?.includes(id));
      if (run) {
        runUrl = run.html_url;
        if (run.status === "completed") {
          await sleep(3000); // the final comment can land just after the run closes
          const last = await api<any[]>(`/repos/${runner}/issues/comments?sort=updated&direction=desc&per_page=30`);
          const final = last.map((c) => readMarker(c.body, id)).find(Boolean);
          if (final?.state === "done") return final.text;
          throw new Error(final?.state === "error" ? final.text : `The cloud run ${run.conclusion}. Details: ${runUrl}`);
        }
        if (!update) onStatus(run.status === "queued" ? "Waiting for a cloud runner…" : "Starting Claude in the cloud…");
      }
    }
  }
  throw new Error(`Still running after an hour. Check ${runUrl || `https://github.com/${runner}/actions`}`);
}
