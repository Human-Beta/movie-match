export const PARTICIPANT_COOKIE_PATH = "/join";

type ParticipantCookieOptions = {
  expires: Date;
  httpOnly: true;
  path: typeof PARTICIPANT_COOKIE_PATH;
  sameSite: "lax";
  secure: boolean;
};

export function getParticipantCookieName(roomCode: string): string {
  return `movie-match.participant.${roomCode}`;
}

export function getParticipantJoinRequestCookieName(roomCode: string): string {
  return `movie-match.join-request.${roomCode}`;
}

export function getParticipantCookieOptions(expiresAt: Date, isProduction: boolean): ParticipantCookieOptions {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: PARTICIPANT_COOKIE_PATH,
    sameSite: "lax" as const,
    secure: isProduction,
  };
}

export function getExpiredParticipantCookieOptions(isProduction: boolean): ParticipantCookieOptions {
  return getParticipantCookieOptions(new Date(0), isProduction);
}
