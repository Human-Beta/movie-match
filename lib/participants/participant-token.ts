import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

export const PARTICIPANT_ACCESS_TOKEN_BYTES = 32;

const PARTICIPANT_ACCESS_TOKEN_LENGTH = 43;
export const participantAccessTokenSchema = z
  .string()
  .length(PARTICIPANT_ACCESS_TOKEN_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

type RandomByteSource = (size: number) => Uint8Array;

export function generateParticipantAccessToken(getRandomBytes: RandomByteSource = size => randomBytes(size)): string {
  const bytes = getRandomBytes(PARTICIPANT_ACCESS_TOKEN_BYTES);

  if (bytes.length !== PARTICIPANT_ACCESS_TOKEN_BYTES) {
    throw new Error("The participant token source returned an unexpected length.");
  }

  return Buffer.from(bytes).toString("base64url");
}

export function hashParticipantAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function parseParticipantAccessToken(rawToken: string | null | undefined): string | null {
  const parsedToken = participantAccessTokenSchema.safeParse(rawToken);

  return parsedToken.success ? parsedToken.data : null;
}

export function hashStoredParticipantAccessToken(rawToken: string | null): string | null {
  const parsedToken = parseParticipantAccessToken(rawToken);

  return parsedToken ? hashParticipantAccessToken(parsedToken) : null;
}
