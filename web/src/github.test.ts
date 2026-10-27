import { test } from "node:test";
import assert from "node:assert/strict";
import { readMarker } from "./github.ts";

// Must match the comments cloud/relay.cjs writes.
test("readMarker", () => {
  assert.deepEqual(readMarker("<!-- xepher:abc123 working -->\nEditing App.tsx", "abc123"), { state: "working", text: "Editing App.tsx" });
  assert.deepEqual(readMarker("<!-- xepher:abc123 done -->\nAdded it.\n\nAll good.", "abc123"), { state: "done", text: "Added it.\n\nAll good." });
  assert.equal(readMarker("<!-- xepher:other done -->\nx", "abc123"), null);
  assert.equal(readMarker("just a comment", "abc123"), null);
});
