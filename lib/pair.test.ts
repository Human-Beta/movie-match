import assert from "node:assert/strict";
import test from "node:test";

import { isPair } from "@/lib/pair";

test("recognizes only arrays with exactly two items", () => {
  assert.equal(isPair([]), false);
  assert.equal(isPair([1]), false);
  assert.equal(isPair([1, 2]), true);
  assert.equal(isPair([1, 2, 3]), false);
});
