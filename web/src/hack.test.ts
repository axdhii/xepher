import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, find, stepsFor, initial, busted, traceRate } from "./hack/scripts.ts";

test("15 actions, each findable by its own words", () => {
  assert.equal(ACTIONS.length, 15);
  for (const a of ACTIONS) for (const w of a.words) assert.equal(find(`${w} now`), a, w);
  assert.equal(find("rm -rf"), undefined);
});

test("every action prints something in any state", () => {
  for (const connected of [false, true])
    for (const a of ACTIONS) {
      const steps = stepsFor(a, { ...initial(), connected });
      assert.ok(steps.some((s) => s.t), a.id);
      for (const s of steps) if (s.bar) assert.ok(s.ms! > 0, a.id);
    }
});

test("link-only actions refuse when offline", () => {
  const exfil = find("exfil")!;
  assert.ok(stepsFor(exfil, initial()).some((s) => s.flash === "denied"));
  assert.ok(stepsFor(exfil, { ...initial(), connected: true }).some((s) => s.set?.loot));
});

test("decrypt then encrypt flips the vault", () => {
  const set = (id: string) => Object.assign({}, ...stepsFor(find(id)!, { ...initial(), firewall: false }).map((s) => s.set ?? {}));
  assert.equal(set("decrypt").encrypted, false);
  assert.equal(set("encrypt").encrypted, true);
  assert.equal(set("connect").connected, true); // firewall down: connect always works
});

test("proxies slow the trace and getting traced drops the link", () => {
  assert.ok(traceRate({ ...initial(), proxies: 9 }) < traceRate(initial()));
  assert.ok(busted({ ...initial(), connected: true }).some((s) => s.set?.connected === false));
});
