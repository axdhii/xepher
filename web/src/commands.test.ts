import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, slug, findProject } from "./commands.ts";

test("parse", () => {
  assert.deepEqual(parse("Open kastay."), { kind: "switch", name: "kastay" });
  assert.deepEqual(parse("switch to the bunksafe project"), { kind: "switch", name: "bunksafe" });
  assert.deepEqual(parse("Create a new project called Weather App"), { kind: "create", name: "Weather App" });
  assert.deepEqual(parse("new repo todo"), { kind: "create", name: "todo" });
  assert.deepEqual(parse("add existing repo fajo-erp"), { kind: "add", name: "fajo-erp" });
  assert.deepEqual(parse("open claude"), { kind: "link" });
  assert.deepEqual(parse("open my projects"), { kind: "projects" });
  assert.deepEqual(parse("set link to https://claude.ai/project/abc"), { kind: "link", url: "https://claude.ai/project/abc" });
  assert.deepEqual(parse("Add a dark mode toggle to the navbar"), { kind: "ask", prompt: "Add a dark mode toggle to the navbar" });
  assert.deepEqual(parse("fix the login bug"), { kind: "ask", prompt: "fix the login bug" });
});

test("slug", () => {
  assert.equal(slug("Weather App!"), "weather-app");
  assert.equal(slug("  --My.Cool_App--  "), "my.cool_app");
});

test("findProject", () => {
  const ps = [{ name: "fajo-erp" }, { name: "kastay" }, { name: "miracle-stone-sculptures-web" }];
  assert.equal(findProject(ps, "fajo erp")?.name, "fajo-erp");
  assert.equal(findProject(ps, "Kastay")?.name, "kastay");
  assert.equal(findProject(ps, "miracle stone")?.name, "miracle-stone-sculptures-web");
  assert.equal(findProject(ps, "nothing"), undefined);
  assert.equal(findProject(ps, "!!"), undefined);
});
