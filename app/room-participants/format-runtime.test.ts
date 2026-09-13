import assert from "node:assert/strict";
import test from "node:test";

import { formatRuntime } from "@/app/room-participants/format-runtime";

test("formats a movie runtime in Ukrainian hours and minutes", () => {
  assert.equal(formatRuntime(55), "55 хв");
  assert.equal(formatRuntime(120), "2 год");
  assert.equal(formatRuntime(125), "2 год 5 хв");
});
