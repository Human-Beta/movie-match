export const PARTICIPANT_ROLE = {
  HOST: "host",
  GUEST: "guest",
} as const;

export const PARTICIPANT_ROLE_VALUES = [PARTICIPANT_ROLE.HOST, PARTICIPANT_ROLE.GUEST] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLE_VALUES)[number];
