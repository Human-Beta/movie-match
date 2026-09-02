import assert from "node:assert/strict";
import test from "node:test";

import {
  getParticipantCookieName,
  getParticipantCookieOptions,
  getParticipantJoinRequestCookieName,
  PARTICIPANT_COOKIE_PATH,
} from "@/lib/participants/participant-cookie";

test("scopes one HttpOnly SameSite=Lax cookie to each room", () => {
  const expiresAt = new Date("2026-08-23T13:00:00.000Z");

  assert.equal(getParticipantCookieName("ABC123"), "movie-match.participant.ABC123");
  assert.equal(getParticipantJoinRequestCookieName("ABC123"), "movie-match.join-request.ABC123");
  assert.deepEqual(getParticipantCookieOptions(expiresAt, false), {
    expires: expiresAt,
    httpOnly: true,
    path: PARTICIPANT_COOKIE_PATH,
    sameSite: "lax",
    secure: false,
  });
  assert.equal(getParticipantCookieOptions(expiresAt, true).secure, true);
});
