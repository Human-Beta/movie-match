import { randomBytes } from "node:crypto";

import { z } from "zod";

export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

export const roomCodeSchema = z
  .string()
  .trim()
  .transform(value => value.toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_PATTERN));

type RandomByteSource = (size: number) => Uint8Array;

export function normalizeRoomCode(value: string): string | null {
  const result = roomCodeSchema.safeParse(value);

  return result.success ? result.data : null;
}

export function generateRoomCode(getRandomBytes: RandomByteSource = size => randomBytes(size)): string {
  const bytes = getRandomBytes(ROOM_CODE_LENGTH);

  if (bytes.length !== ROOM_CODE_LENGTH) {
    throw new Error("The random byte source returned an unexpected length.");
  }

  return Array.from(bytes, byte => ROOM_CODE_ALPHABET[byte & (ROOM_CODE_ALPHABET.length - 1)]).join("");
}
