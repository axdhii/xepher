// GitHub API, only for checking releases (the repo is private, so it needs the token).
let token = "";
export const setToken = (t: string) => (token = t.trim());

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new Error("Add your GitHub token in CFG first.");
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

export async function latestRelease(runner: string) {
  const r = await api(`/repos/${runner}/releases/latest`);
  const build = Number(String(r.tag_name).split(".").pop());
  const apk = r.assets.find((a: any) => a.name.endsWith(".apk"));
  return { build, version: String(r.tag_name).replace(/^v/, ""), apkUrl: apk?.url as string | undefined };
}
