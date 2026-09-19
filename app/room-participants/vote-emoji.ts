import type { VoteValue } from "@/lib/ballots/ballot-vote";

const VOTE_EMOJI: Readonly<Record<VoteValue, string>> = {
  want_to_watch: "🔥",
  could_watch: "🙂",
  not_now: "😐",
  no: "❌",
};

export function getVoteEmoji(value: VoteValue): string {
  return VOTE_EMOJI[value];
}
