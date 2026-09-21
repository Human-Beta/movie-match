const NO_MATCH_MESSAGE_KEYS = ["noMatchMessages.0", "noMatchMessages.1", "noMatchMessages.2", "noMatchMessages.3"] as const;

export function getNoMatchMessageKey(roundId: string): (typeof NO_MATCH_MESSAGE_KEYS)[number] {
  const index = [...roundId].reduce((total, character) => total + character.charCodeAt(0), 0) % NO_MATCH_MESSAGE_KEYS.length;
  return NO_MATCH_MESSAGE_KEYS[index] ?? NO_MATCH_MESSAGE_KEYS[0];
}
