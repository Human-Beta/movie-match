import "server-only";

import { DrizzleBallotRepository } from "@/lib/ballots/ballot-repository";
import { BallotService, type BallotSubmissionResult } from "@/lib/ballots/ballot-service";
import type { BallotInput } from "@/lib/ballots/ballot-input";

const service = new BallotService(new DrizzleBallotRepository());

export function submitBallot(input: BallotInput, storedAccessToken: string | null): Promise<BallotSubmissionResult> {
  return service.submit(input, storedAccessToken);
}
