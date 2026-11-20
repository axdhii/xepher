import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, GROUPS, find, initial, caught, exposure, type Sys, type Step } from "./hack/scripts.ts";

// Runs an action's state changes in order, like the console does.
const apply = (s: Sys, id: string) => find(id)!.run(s).reduce<Sys>((o, st: Step) => (st.set ? { ...o, ...st.set(o) } : o), s);

test("20 actions across the five groups, each findable", () => {
  assert.equal(ACTIONS.length, 20);
  for (const g of GROUPS) assert.ok(ACTIONS.some((a) => a.group === g), g);
  for (const a of ACTIONS) for (const w of a.words) assert.equal(find(w), a, w);
  assert.equal(find("rm"), undefined);
});

test("every action prints something from a fresh start", () => {
  for (const a of ACTIONS) assert.ok(a.run(initial()).some((s) => s.t), a.id);
});

test("the full chain: probe, audit, breach, elevate, harvest, crack, pivot, sweep", () => {
  let s = initial();
  assert.ok(find("breach")!.run(s).some((x) => x.c === "err")); // nothing known yet
  s = apply(s, "probe");
  s = apply(s, "audit");
  s = apply(s, "breach");
  assert.equal(s.sessions.length, 1);
  assert.ok(s.hosts[0].owned);
  s = apply(s, "elevate");
  assert.ok(s.sessions[0].elevated);
  s = apply(s, "harvest");
  assert.ok(s.records.length > 0);
  s = apply(s, "pivot");
  assert.equal(s.zones, 2);
  s = apply(s, "sweep");
  assert.ok(s.hosts.length > 1);
  assert.ok(s.detection > 0);
});

test("relays slow exposure and getting caught drops every session", () => {
  const s = { ...initial(), sessions: [{ id: 1, host: "x", ip: "1", user: "u", elevated: false, anchored: false, opened: 0 }] };
  assert.ok(exposure({ ...s, hops: 9 }) < exposure(s));
  const after = caught(s).reduce<Sys>((o, st) => (st.set ? { ...o, ...st.set(o) } : o), s);
  assert.equal(after.sessions.length, 0);
});
