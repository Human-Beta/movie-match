import assert from "node:assert/strict";
import test from "node:test";

import {
  generateParticipantAccessToken,
  hashParticipantAccessToken,
  hashStoredParticipantAccessToken,
  parseParticipantAccessToken,
  PARTICIPANT_ACCESS_TOKEN_BYTES,
} from "@/lib/participants/participant-token";

test("generates a 256-bit base64url participant credential", () => {
  const rawToken = generateParticipantAccessToken(size => {
    assert.equal(size, PARTICIPANT_ACCESS_TOKEN_BYTES);
    return Uint8Array.from({ length: size }, (_, index) => index);
  });

  assert.equal(rawToken.length, 43);
  assert.match(rawToken, /^[A-Za-z0-9_-]+$/);
});

test("stores only a deterministic SHA-256 hash", () => {
  const rawToken = generateParticipantAccessToken(() => Uint8Array.from({ length: PARTICIPANT_ACCESS_TOKEN_BYTES }, () => 7));
  const accessTokenHash = hashParticipantAccessToken(rawToken);

  assert.equal(accessTokenHash.length, 64);
  assert.match(accessTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(accessTokenHash, rawToken);
  assert.equal(hashStoredParticipantAccessToken(rawToken), accessTokenHash);
});

test("ignores malformed cookie credentials", () => {
  assert.equal(parseParticipantAccessToken(undefined), null);
  assert.equal(hashStoredParticipantAccessToken(null), null);
  assert.equal(hashStoredParticipantAccessToken("short"), null);
  assert.equal(hashStoredParticipantAccessToken("!".repeat(43)), null);
});

test("rejects a broken random byte source", () => {
  assert.throws(() => generateParticipantAccessToken(() => Uint8Array.from([1, 2, 3])), /unexpected length/);
});
