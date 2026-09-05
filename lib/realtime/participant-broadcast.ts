import { PARTICIPANTS_CHANGED_EVENT } from "@/lib/realtime/participant-events";

export const PARTICIPANT_BROADCAST_MAX_ATTEMPTS = 3;
export const PARTICIPANT_BROADCAST_REQUEST_TIMEOUT_MS = 2_000;
export const PARTICIPANT_BROADCAST_RETRY_DELAY_MS = 200;

type BroadcastFetch = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

export type ParticipantBroadcastConfig = {
  projectUrl: string;
  publishableKey: string;
};

export type ParticipantBroadcastOptions = {
  fetchImpl?: BroadcastFetch;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  retryDelayMs?: number;
  sleep?: Sleep;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

export class ParticipantBroadcastPublisher {
  private readonly fetchImpl: BroadcastFetch;
  private readonly maxAttempts: number;
  private readonly requestTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly sleep: Sleep;

  constructor(
    private readonly config: ParticipantBroadcastConfig,
    options: ParticipantBroadcastOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = options.maxAttempts ?? PARTICIPANT_BROADCAST_MAX_ATTEMPTS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? PARTICIPANT_BROADCAST_REQUEST_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? PARTICIPANT_BROADCAST_RETRY_DELAY_MS;
    this.sleep = options.sleep ?? sleep;
  }

  async publishParticipantsChanged(realtimeTopic: string): Promise<boolean> {
    const endpoint = new URL(
      `realtime/v1/api/broadcast/${encodeURIComponent(realtimeTopic)}/events/${PARTICIPANTS_CHANGED_EVENT}`,
      this.getProjectBaseUrl(),
    );

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (await this.tryPublish(endpoint)) {
        return true;
      }

      if (attempt + 1 < this.maxAttempts) {
        await this.sleep(this.retryDelayMs * 2 ** attempt);
      }
    }

    return false;
  }

  private getProjectBaseUrl(): string {
    return this.config.projectUrl.endsWith("/") ? this.config.projectUrl : `${this.config.projectUrl}/`;
  }

  private async tryPublish(endpoint: URL): Promise<boolean> {
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          apikey: this.config.publishableKey,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
